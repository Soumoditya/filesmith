import { AlertTriangle, ClipboardCopy, FileDown, ScanText } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { usePdfDocument } from "../components/PdfThumb";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Checkbox,
  Notice,
  ProgressBar,
  SegmentedControl,
  Spinner,
  Textarea,
} from "../components/ui";
import { baseNameOf, saveBlob } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { extractPdfText } from "../lib/raster";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";

const TOOL = getTool("pdf-to-text")!;

type Format = "text" | "markdown";

/** Joins page text, optionally marking page boundaries. */
function assemble(pages: string[], format: Format, marks: boolean): string {
  return pages
    .map((text, i) => {
      const body = text.trim();
      if (!marks) return body;
      return format === "markdown"
        ? `## Page ${i + 1}\n\n${body}`
        : `--- Page ${i + 1} ---\n\n${body}`;
    })
    .filter((chunk) => chunk.trim())
    .join(format === "markdown" ? "\n\n" : "\n\n\n");
}

export default function PdfToText() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<Format>("text");
  const [pageMarks, setPageMarks] = useState(true);
  const [pages, setPages] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const job = useToolJob<string[]>();

  const pdf = usePdfDocument(file);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  // Extract as soon as the document opens — there's nothing to configure first.
  useEffect(() => {
    if (!file || !pdf.doc) return;
    let cancelled = false;

    void job.run(async (report) => {
      const result = await extractPdfText(file, report);
      if (!cancelled) setPages(result);
      return result;
    });

    return () => {
      cancelled = true;
    };
    // Re-running on every job identity change would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, pdf.doc]);

  const startOver = () => {
    setFile(null);
    setPages(null);
    job.reset();
  };

  const output = pages ? assemble(pages, format, pageMarks) : "";
  const characters = output.length;
  const words = output.trim() ? output.trim().split(/\s+/).length : 0;

  // Almost no text means a scan: the page images carry the words, not the file.
  const looksScanned = pages !== null && characters < 40 * Math.max(pages.length, 1);

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    if (!file) return;
    const ext = format === "markdown" ? "md" : "txt";
    saveBlob(
      new Blob([output], { type: "text/plain;charset=utf-8" }),
      `${baseNameOf(file.name)}.${ext}`,
    );
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept=".pdf,application/pdf"
          title="Drop a PDF here"
          hint="Pull the words out so you can copy, edit or search them."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <FileHeader
          file={file}
          detail={pdf.pageCount > 0 ? `${pdf.pageCount} pages` : undefined}
          onClear={startOver}
          disabled={job.busy}
        />

        {pdf.error && (
          <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
            {pdf.error}
          </Notice>
        )}

        {pdf.needsPassword && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
            This PDF needs a password. Use the{" "}
            <a href="/t/unlock-pdf" className="font-medium underline underline-offset-2">
              Remove password
            </a>{" "}
            tool first.
          </Notice>
        )}

        {(pdf.loading || job.busy) && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm text-muted">
              <Spinner /> Reading the text…
            </div>
            {job.progress !== null && <ProgressBar percent={job.progress} />}
          </div>
        )}

        {job.error && (
          <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
            {job.error}
          </Notice>
        )}

        {looksScanned && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
            There’s almost no text in this file, which usually means it’s a scan — the
            words are part of the page image rather than real text. The{" "}
            <a href="/t/ocr-pdf" className="font-medium underline underline-offset-2">
              Make a scan searchable
            </a>{" "}
            tool reads text out of pictures.
          </Notice>
        )}

        {pages && !job.busy && (
          <>
            <Card className="space-y-4 p-5">
              <SegmentedControl
                options={[
                  { value: "text", label: "Plain text" },
                  { value: "markdown", label: "Markdown" },
                ]}
                value={format}
                onChange={(v) => setFormat(v as Format)}
              />

              <Checkbox
                label="Mark where each page starts"
                checked={pageMarks}
                onChange={(e) => setPageMarks(e.target.checked)}
              />

              <p className="text-sm text-muted">
                {words.toLocaleString()} words · {characters.toLocaleString()} characters
              </p>

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={download} disabled={!output}>
                  <FileDown className="size-4" aria-hidden />
                  Download .{format === "markdown" ? "md" : "txt"}
                </Button>
                <Button onClick={copy} disabled={!output}>
                  <ClipboardCopy className="size-4" aria-hidden />
                  {copied ? "Copied" : "Copy all"}
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
                <ScanText className="size-4 text-faint" aria-hidden />
                The text
              </label>
              <Textarea
                readOnly
                rows={18}
                value={output}
                className="font-mono text-xs"
                aria-label="Extracted text"
              />
            </Card>
          </>
        )}
      </div>
    </ToolShell>
  );
}
