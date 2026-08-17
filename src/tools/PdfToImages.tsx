import { AlertTriangle, ImageDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { usePdfDocument } from "../components/PdfThumb";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Field,
  Notice,
  ProgressBar,
  SegmentedControl,
  Select,
  Slider,
  Spinner,
  TextInput,
} from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { formatPageRanges, parsePageRanges } from "../lib/pageRanges";
import { renderPdfPages, type ImageFormat } from "../lib/raster";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";

const TOOL = getTool("pdf-to-image")!;

const DPI_PRESETS = [
  { value: 72, label: "72 — screen, smallest" },
  { value: 150, label: "150 — good all-rounder" },
  { value: 200, label: "200 — sharp" },
  { value: 300, label: "300 — print quality" },
  { value: 600, label: "600 — archival, very large" },
];

export default function PdfToImages() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ImageFormat>("jpeg");
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(0.9);
  const [pagesInput, setPagesInput] = useState("");
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

  const pageList = parsed.pages.length > 0 ? parsed.pages : undefined;
  const count = pageList?.length ?? pdf.pageCount;

  const startOver = () => {
    setFile(null);
    setPagesInput("");
    job.reset();
  };

  const convert = async () => {
    if (!file) return;
    const stem = baseNameOf(file.name);
    const ext = format === "jpeg" ? "jpg" : format;

    await job.run(async (report) => {
      const rendered = await renderPdfPages(
        file,
        { dpi, format, quality, pages: pageList },
        report,
      );
      return rendered.map((page) => ({
        name: `${stem} page ${page.page}.${ext}`,
        blob: page.blob,
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
          hint="Every page becomes a picture. Pick the quality and size you need."
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

        {pdf.loading && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Spinner /> Reading the document…
          </div>
        )}

        {job.result ? (
          <ResultCard
            files={job.result}
            headline={`${job.result.length} ${job.result.length === 1 ? "image" : "images"} ready`}
            onStartOver={startOver}
          />
        ) : (
          pdf.doc && (
            <>
              <Card className="space-y-5 p-5">
                <Field label="Picture format">
                  {() => (
                    <SegmentedControl
                      options={[
                        { value: "jpeg", label: "JPG" },
                        { value: "png", label: "PNG" },
                        { value: "webp", label: "WebP" },
                      ]}
                      value={format}
                      onChange={(v) => setFormat(v as ImageFormat)}
                    />
                  )}
                </Field>

                <p className="text-xs leading-relaxed text-muted">
                  {format === "jpeg" &&
                    "JPG is smallest and opens anywhere. Best for pages that are mostly photos."}
                  {format === "png" &&
                    "PNG keeps every pixel exactly, so text stays crisp — but the files are much bigger."}
                  {format === "webp" &&
                    "WebP is smaller than JPG at the same quality, and every current browser reads it."}
                </p>

                <Field
                  label="Resolution"
                  hint="Higher means sharper and larger. 150 suits most uses; choose 300 if it's going to be printed."
                >
                  {(id) => (
                    <Select
                      id={id}
                      value={dpi}
                      onChange={(e) => setDpi(Number(e.target.value))}
                    >
                      {DPI_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label} DPI
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                {format !== "png" && (
                  <Slider
                    label="Quality"
                    min={40}
                    max={100}
                    step={5}
                    value={Math.round(quality * 100)}
                    display={`${Math.round(quality * 100)}%`}
                    onChange={(e) => setQuality(Number(e.target.value) / 100)}
                  />
                )}

                <Field
                  label="Which pages?"
                  hint={`Leave empty for all ${pdf.pageCount}. Or type something like 1-3, 7.`}
                >
                  {(id) => (
                    <TextInput
                      id={id}
                      value={pagesInput}
                      onChange={(e) => setPagesInput(e.target.value)}
                      placeholder="All pages"
                      inputMode="numeric"
                    />
                  )}
                </Field>

                {parsed.error && (
                  <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                    {parsed.error}
                  </Notice>
                )}

                <p className="text-sm text-muted">
                  {count} {count === 1 ? "image" : "images"}
                  {pageList && ` — pages ${formatPageRanges(pageList)}`}
                  {count > 1 && ", downloaded together as a zip"}.
                </p>
              </Card>

              {job.error && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  {job.error}
                </Notice>
              )}

              {job.busy && (
                <div className="space-y-1.5">
                  <ProgressBar percent={job.progress ?? 0} />
                  <p className="text-xs text-muted">
                    Rendering pages… {Math.round(job.progress ?? 0)}%
                  </p>
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                busy={job.busy}
                disabled={!!parsed.error || count === 0}
                onClick={convert}
              >
                <ImageDown className="size-4" aria-hidden />
                Make {count} {count === 1 ? "picture" : "pictures"}
              </Button>
            </>
          )
        )}
      </div>
    </ToolShell>
  );
}
