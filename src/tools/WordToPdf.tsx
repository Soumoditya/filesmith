import { AlertTriangle, FileOutput } from "lucide-react";
import { useEffect, useState } from "react";
import { DocPreview } from "../components/DocPreview";
import { DropZone } from "../components/DropZone";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Field,
  Notice,
  ProgressBar,
  Select,
  Slider,
} from "../components/ui";
import { FAMILIES, type FontFamily } from "../lib/doc/fontCatalogue";
import {
  DEFAULT_STYLE,
  pageSetup,
  type Block,
  type PageSizeName,
} from "../lib/doc/model";
import { renderDocument } from "../lib/doc/render";
import { baseNameOf, formatBytes } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { htmlToBlocks } from "../lib/wordConvert";

const TOOL = getTool("word-to-pdf")!;

export default function WordToPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [family, setFamily] = useState<FontFamily>("serif");
  const [pageSize, setPageSize] = useState<PageSizeName>("a4");
  const [baseSize, setBaseSize] = useState(11);
  const [margin, setMargin] = useState(64);
  const [preview, setPreview] = useState<string[]>([]);
  const job = useToolJob<OutputFile[]>();

  useEffect(() => {
    const staged = claimFiles();
    if (staged) setFiles(staged.filter((f) => f.name.toLowerCase().endsWith(".docx")));
  }, []);

  const startOver = () => {
    setFiles([]);
    setPreview([]);
    job.reset();
  };

  const buildSpec = (blocks: Block[], title: string) => ({
    page: pageSetup(pageSize, margin),
    style: { ...DEFAULT_STYLE, family, baseSize },
    blocks,
    title,
  });

  const convert = async () => {
    if (files.length === 0) return;

    await job.run(async (report) => {
      const { convertToHtml } = await import("mammoth");
      const out: OutputFile[] = [];

      for (const [index, file] of files.entries()) {
        const { value: html } = await convertToHtml({
          arrayBuffer: await file.arrayBuffer(),
        });
        const blocks = htmlToBlocks(html);
        const rendered = await renderDocument(
          buildSpec(blocks, baseNameOf(file.name)),
        );

        out.push({
          name: `${baseNameOf(file.name)}.pdf`,
          blob: new Blob([rendered.bytes as BlobPart], { type: "application/pdf" }),
        });
        report(index + 1, files.length);
      }

      return out;
    });
  };

  // A quick look at the first file, so settings can be judged before converting.
  useEffect(() => {
    if (files.length === 0) return;
    let cancelled = false;
    const urls: string[] = [];

    const timer = setTimeout(async () => {
      try {
        const { convertToHtml } = await import("mammoth");
        const { value: html } = await convertToHtml({
          arrayBuffer: await files[0].arrayBuffer(),
        });
        const rendered = await renderDocument(
          buildSpec(htmlToBlocks(html), baseNameOf(files[0].name)),
        );
        if (cancelled) return;

        const { openPdf, renderPageToCanvas } = await import("../lib/pdfRender");
        const opened = await openPdf(rendered.bytes.slice().buffer as ArrayBuffer);
        try {
          for (let i = 1; i <= Math.min(opened.doc.numPages, 3); i++) {
            const canvas = await renderPageToCanvas(opened.doc, i, 560);
            const blob = await new Promise<Blob | null>((r) =>
              canvas.toBlob(r, "image/webp", 0.9),
            );
            if (blob) urls.push(URL.createObjectURL(blob));
          }
        } finally {
          await opened.close();
        }

        if (!cancelled) setPreview(urls);
      } catch {
        // The preview is a convenience; conversion reports its own errors.
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, family, pageSize, baseSize, margin]);

  if (files.length === 0) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(dropped) =>
            setFiles(dropped.filter((f) => f.name.toLowerCase().endsWith(".docx")))
          }
          accept=".docx"
          multiple
          title="Drop your Word documents here"
          hint="Modern .docx files. Old .doc files need saving as .docx in Word first."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell
      tool={TOOL}
      wide
      caveat={
        <>
          The document is re-typeset rather than photographed, so the text stays
          real and selectable — but it won’t be pixel-identical to Word. Headings,
          bold, italics, lists and tables come across; floating images, columns and
          elaborate styling may not.
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="p-4">
            <p className="text-sm font-medium text-ink">
              {files.length} {files.length === 1 ? "document" : "documents"} ·{" "}
              {formatBytes(files.reduce((s, f) => s + f.size, 0))}
            </p>
            <ul className="mt-2 space-y-0.5">
              {files.map((f) => (
                <li key={f.name} className="truncate text-xs text-muted">
                  {f.name}
                </li>
              ))}
            </ul>
          </Card>

          {job.result ? (
            <ResultCard
              files={job.result}
              headline={`${job.result.length} PDF${job.result.length === 1 ? "" : "s"} ready`}
              onStartOver={startOver}
            />
          ) : (
            <>
              <Card className="space-y-5 p-4">
                <Field
                  label="Typeface"
                  hint={FAMILIES.find((f) => f.id === family)?.note}
                >
                  {(id) => (
                    <Select
                      id={id}
                      value={family}
                      onChange={(e) => setFamily(e.target.value as FontFamily)}
                    >
                      {FAMILIES.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="Paper size">
                  {(id) => (
                    <Select
                      id={id}
                      value={pageSize}
                      onChange={(e) => setPageSize(e.target.value as PageSizeName)}
                    >
                      <option value="a4">A4</option>
                      <option value="letter">Letter</option>
                      <option value="legal">Legal</option>
                      <option value="a5">A5</option>
                    </Select>
                  )}
                </Field>

                <Slider
                  label="Text size"
                  min={8}
                  max={16}
                  step={0.5}
                  value={baseSize}
                  display={`${baseSize} pt`}
                  onChange={(e) => setBaseSize(Number(e.target.value))}
                />

                <Slider
                  label="Margin"
                  min={24}
                  max={110}
                  step={4}
                  value={margin}
                  display={`${Math.round((margin / 72) * 25.4)} mm`}
                  onChange={(e) => setMargin(Number(e.target.value))}
                />
              </Card>

              {job.error && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  {job.error}
                </Notice>
              )}

              {job.busy && (
                <div className="space-y-1.5">
                  <ProgressBar percent={job.progress ?? 0} />
                  <p className="text-xs text-muted">Converting…</p>
                </div>
              )}

              <Button variant="primary" size="lg" busy={job.busy} onClick={convert}>
                <FileOutput className="size-4" aria-hidden />
                Convert to PDF
              </Button>
            </>
          )}
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium text-ink">Preview</p>
          <DocPreview
            pages={preview}
            building={preview.length === 0}
            error={null}
            emptyMessage="Building a preview of the first few pages…"
          />
        </div>
      </div>
    </ToolShell>
  );
}
