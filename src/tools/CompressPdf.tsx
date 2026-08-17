import { AlertTriangle, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
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
} from "../components/ui";
import { baseNameOf, formatBytes } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { renderPdfPages } from "../lib/raster";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker, proxy } from "../lib/workers";

const TOOL = getTool("compress-pdf")!;

type Mode = "lossless" | "rasterise";

const PRESETS = [
  { dpi: 200, quality: 0.85, label: "Light — keeps it sharp" },
  { dpi: 150, quality: 0.75, label: "Balanced — the usual choice" },
  { dpi: 110, quality: 0.6, label: "Strong — noticeably softer" },
  { dpi: 72, quality: 0.5, label: "Maximum — screen reading only" },
];

export default function CompressPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("lossless");
  const [preset, setPreset] = useState(1);
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(0.75);
  const job = useToolJob<OutputFile[]>();

  const pdf = usePdfDocument(file);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  // Presets simply move the two sliders, which stay editable afterwards.
  useEffect(() => {
    const chosen = PRESETS[preset];
    if (chosen) {
      setDpi(chosen.dpi);
      setQuality(chosen.quality);
    }
  }, [preset]);

  const startOver = () => {
    setFile(null);
    job.reset();
  };

  const compress = async () => {
    if (!file) return;
    const stem = baseNameOf(file.name);

    await job.run(async (report) => {
      const worker = getPdfWorker();

      if (mode === "lossless") {
        const bytes = await worker.shrinkLossless(file);
        return [
          {
            name: `${stem} (smaller).pdf`,
            blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
          },
        ];
      }

      // Rendering happens here because it needs a canvas; the rebuild goes
      // back to the worker so the main thread isn't blocked assembling it.
      const rendered = await renderPdfPages(
        file,
        { dpi, format: "jpeg", quality },
        (done, total) => report(done, total * 1.2),
      );

      const images = await Promise.all(
        rendered.map(async (page) => ({
          data: await page.blob.arrayBuffer(),
          format: "jpg" as const,
        })),
      );
      const sizes = rendered.map((page) => ({
        width: page.pointWidth,
        height: page.pointHeight,
      }));

      const bytes = await worker.rebuildFromPageImages(images, sizes, proxy(report));
      return [
        {
          name: `${stem} (smaller).pdf`,
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        },
      ];
    });
  };

  const saved =
    file && job.result?.[0] ? file.size - job.result[0].blob.size : 0;
  const savedPercent = file && saved > 0 ? Math.round((saved / file.size) * 100) : 0;

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept=".pdf,application/pdf"
          title="Drop a PDF here"
          hint="Make it smaller. You choose how much quality to trade away."
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

        {pdf.loading && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Spinner /> Reading the document…
          </div>
        )}

        {job.result ? (
          <ResultCard
            files={job.result}
            headline={
              saved > 0
                ? `${savedPercent}% smaller — ${formatBytes(file.size)} down to ${formatBytes(job.result[0].blob.size)}`
                : "This file was already about as small as it gets"
            }
            detail={
              saved > 0
                ? mode === "rasterise"
                  ? "The text is now part of the page image, so it can't be selected or searched."
                  : "Nothing was re-encoded, so the text is untouched."
                : "Try the stronger option if you need it smaller."
            }
            onStartOver={startOver}
          />
        ) : (
          pdf.doc && (
            <>
              <Card className="space-y-5 p-5">
                <Field label="How should it be shrunk?">
                  {() => (
                    <SegmentedControl
                      options={[
                        { value: "lossless", label: "Keep the text" },
                        { value: "rasterise", label: "Shrink hard" },
                      ]}
                      value={mode}
                      onChange={(v) => setMode(v as Mode)}
                    />
                  )}
                </Field>

                {mode === "lossless" ? (
                  <Notice>
                    Strips metadata and repacks the file without touching a single
                    pixel. Text stays selectable and searchable. The saving is usually
                    modest — often 5 to 20% — and sometimes nothing at all if the file
                    was already well made.
                  </Notice>
                ) : (
                  <>
                    <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
                      Each page is turned into a picture. This shrinks files
                      dramatically, but the text stops being text — it can’t be
                      selected, searched or copied afterwards. Use it when a portal
                      refuses your file and you’ve run out of options.
                    </Notice>

                    <Field label="Preset">
                      {(id) => (
                        <Select
                          id={id}
                          value={preset}
                          onChange={(e) => setPreset(Number(e.target.value))}
                        >
                          {PRESETS.map((p, i) => (
                            <option key={p.label} value={i}>
                              {p.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>

                    <Slider
                      label="Resolution"
                      min={50}
                      max={300}
                      step={10}
                      value={dpi}
                      display={`${dpi} DPI`}
                      onChange={(e) => setDpi(Number(e.target.value))}
                    />

                    <Slider
                      label="Picture quality"
                      min={30}
                      max={95}
                      step={5}
                      value={Math.round(quality * 100)}
                      display={`${Math.round(quality * 100)}%`}
                      onChange={(e) => setQuality(Number(e.target.value) / 100)}
                    />

                    <p className="text-xs leading-relaxed text-muted">
                      Lowering quality usually costs less readability than lowering
                      resolution, so try that first.
                    </p>
                  </>
                )}
              </Card>

              {job.error && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  {job.error}
                </Notice>
              )}

              {job.busy && (
                <div className="space-y-1.5">
                  <ProgressBar percent={Math.min(job.progress ?? 0, 100)} />
                  <p className="text-xs text-muted">Working…</p>
                </div>
              )}

              <Button variant="primary" size="lg" busy={job.busy} onClick={compress}>
                <Minimize2 className="size-4" aria-hidden />
                Make it smaller
              </Button>
            </>
          )
        )}
      </div>
    </ToolShell>
  );
}
