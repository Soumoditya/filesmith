import { AlertTriangle, Scissors } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { PdfThumb, usePdfDocument } from "../components/PdfThumb";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Field,
  Notice,
  ProgressBar,
  SegmentedControl,
  Spinner,
  TextInput,
} from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { formatPageRanges, parsePageRanges } from "../lib/pageRanges";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker, proxy } from "../lib/workers";

const TOOL = getTool("split-pdf")!;

type Mode = "extract" | "ranges" | "every";

const MODES: Array<{ value: Mode; label: string }> = [
  { value: "extract", label: "Pick pages" },
  { value: "ranges", label: "Split into parts" },
  { value: "every", label: "Every page separately" },
];

export default function SplitPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("extract");
  const [pagesInput, setPagesInput] = useState("");
  const [splitAt, setSplitAt] = useState("");
  const job = useToolJob<OutputFile[]>();

  const pdf = usePdfDocument(file);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  const parsed = useMemo(
    () => parsePageRanges(pagesInput, pdf.pageCount),
    [pagesInput, pdf.pageCount],
  );

  const splitPoints = useMemo(
    () => parsePageRanges(splitAt, pdf.pageCount),
    [splitAt, pdf.pageCount],
  );

  /** The groups of pages each output file will contain. */
  const groups = useMemo<number[][]>(() => {
    if (pdf.pageCount === 0) return [];

    if (mode === "every") {
      return Array.from({ length: pdf.pageCount }, (_, i) => [i + 1]);
    }

    if (mode === "extract") {
      return parsed.pages.length > 0 ? [parsed.pages] : [];
    }

    // "ranges": each listed page starts a new document.
    const starts = new Set(splitPoints.pages);
    if (starts.size === 0) return [];

    const out: number[][] = [];
    let current: number[] = [];
    for (let p = 1; p <= pdf.pageCount; p++) {
      if (starts.has(p) && current.length > 0) {
        out.push(current);
        current = [];
      }
      current.push(p);
    }
    if (current.length > 0) out.push(current);
    return out;
  }, [mode, parsed.pages, splitPoints.pages, pdf.pageCount]);

  const reset = () => {
    setFile(null);
    setPagesInput("");
    setSplitAt("");
    job.reset();
  };

  const split = async () => {
    if (!file || groups.length === 0) return;
    const stem = baseNameOf(file.name);

    await job.run(async (report) => {
      const worker = getPdfWorker();
      const parts = await worker.splitPages(file, groups, proxy(report));

      return parts.map((bytes, i) => ({
        name:
          groups.length === 1
            ? `${stem} (pages ${formatPageRanges(groups[i])}).pdf`
            : `${stem} ${i + 1}.pdf`,
        blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
      }));
    });
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept=".pdf,application/pdf"
          title="Drop a PDF here"
          hint="Pull out the pages you need, or break one document into several."
        />
      </ToolShell>
    );
  }

  const rangeError = mode === "extract" ? parsed.error : mode === "ranges" ? splitPoints.error : null;

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <FileHeader
          file={file}
          detail={pdf.pageCount > 0 ? `${pdf.pageCount} pages` : undefined}
          onClear={reset}
          disabled={job.busy}
        />

        {pdf.error && (
          <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
            {pdf.error}
          </Notice>
        )}

        {pdf.needsPassword && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
            This PDF needs a password to open. Use the{" "}
            <a href="/t/unlock-pdf" className="font-medium underline underline-offset-2">
              Remove password
            </a>{" "}
            tool on it first.
          </Notice>
        )}

        {pdf.loading && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Spinner /> Reading the document…
          </div>
        )}

        {pdf.doc && !job.result && (
          <>
            <Card className="space-y-5 p-5">
              <div className="scroll-x -mx-1 px-1 pb-1">
                <SegmentedControl options={MODES} value={mode} onChange={setMode} />
              </div>

              {mode === "extract" && (
                <Field
                  label="Which pages do you want?"
                  hint={`Type something like 1-3, 7, 12. This PDF has ${pdf.pageCount} pages. The order you type is the order you get.`}
                >
                  {(id) => (
                    <TextInput
                      id={id}
                      value={pagesInput}
                      onChange={(e) => setPagesInput(e.target.value)}
                      placeholder={`1-${Math.min(3, pdf.pageCount)}`}
                      inputMode="numeric"
                    />
                  )}
                </Field>
              )}

              {mode === "ranges" && (
                <Field
                  label="Start a new file at these pages"
                  hint="Type 5, 9 to get pages 1-4, then 5-8, then 9 to the end."
                >
                  {(id) => (
                    <TextInput
                      id={id}
                      value={splitAt}
                      onChange={(e) => setSplitAt(e.target.value)}
                      placeholder="5, 9"
                      inputMode="numeric"
                    />
                  )}
                </Field>
              )}

              {mode === "every" && (
                <p className="text-sm leading-relaxed text-muted">
                  Every page becomes its own PDF — {pdf.pageCount} files, downloaded
                  together as a zip.
                </p>
              )}

              {rangeError && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  {rangeError}
                </Notice>
              )}

              {groups.length > 0 && !rangeError && (
                <p className="text-sm text-muted">
                  {groups.length === 1
                    ? `You’ll get one PDF with ${groups[0].length} ${groups[0].length === 1 ? "page" : "pages"}.`
                    : `You’ll get ${groups.length} PDFs.`}
                  {mode === "ranges" && groups.length > 1 && (
                    <>
                      {" "}
                      Split as: {groups.map((g) => formatPageRanges(g)).join(" · ")}
                    </>
                  )}
                </p>
              )}
            </Card>

            {mode === "extract" && parsed.pages.length > 0 && (
              <div>
                <p className="mb-3 text-sm font-medium text-ink">
                  Preview — {formatPageRanges(parsed.pages)}
                </p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                  {parsed.pages.slice(0, 24).map((page, i) => (
                    <figure key={`${page}-${i}`}>
                      <PdfThumb doc={pdf.doc!} page={page} width={140} />
                      <figcaption className="mt-1 text-center text-xs text-muted">
                        {page}
                      </figcaption>
                    </figure>
                  ))}
                </div>
                {parsed.pages.length > 24 && (
                  <p className="mt-3 text-xs text-faint">
                    Showing the first 24 of {parsed.pages.length} pages.
                  </p>
                )}
              </div>
            )}

            {job.error && (
              <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                {job.error}
              </Notice>
            )}

            {job.busy && (
              <div className="space-y-1.5">
                <ProgressBar percent={job.progress ?? 0} />
                <p className="text-xs text-muted">
                  Splitting… {Math.round(job.progress ?? 0)}%
                </p>
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              busy={job.busy}
              disabled={groups.length === 0 || !!rangeError}
              onClick={split}
            >
              <Scissors className="size-4" aria-hidden />
              {groups.length > 1 ? `Split into ${groups.length} files` : "Extract pages"}
            </Button>
          </>
        )}

        {job.result && (
          <ResultCard
            files={job.result}
            headline={
              job.result.length === 1
                ? "Your pages are ready"
                : `Split into ${job.result.length} files`
            }
            onStartOver={() => job.reset()}
          />
        )}
      </div>
    </ToolShell>
  );
}
