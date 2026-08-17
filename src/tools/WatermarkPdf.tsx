import { AlertTriangle, Stamp } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { PdfThumb, usePdfDocument } from "../components/PdfThumb";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Checkbox,
  Field,
  Notice,
  Slider,
  Spinner,
  TextInput,
} from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker } from "../lib/workers";

const TOOL = getTool("watermark-pdf")!;

const PRESETS = ["DRAFT", "CONFIDENTIAL", "COPY", "SAMPLE", "DO NOT COPY"];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255 || 0,
    g: parseInt(full.slice(2, 4), 16) / 255 || 0,
    b: parseInt(full.slice(4, 6), 16) / 255 || 0,
  };
}

export default function WatermarkPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("DRAFT");
  const [fontSize, setFontSize] = useState(60);
  const [opacity, setOpacity] = useState(0.15);
  const [angle, setAngle] = useState(45);
  const [colour, setColour] = useState("#808080");
  const [tile, setTile] = useState(false);
  const job = useToolJob<OutputFile[]>();

  const pdf = usePdfDocument(file);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  const startOver = () => {
    setFile(null);
    job.reset();
  };

  const apply = async () => {
    if (!file || !text.trim()) return;
    const stem = baseNameOf(file.name);

    await job.run(async () => {
      const worker = getPdfWorker();
      const bytes = await worker.watermark(file, {
        text: text.trim(),
        fontSize,
        opacity,
        angle,
        colour: hexToRgb(colour),
        tile,
      });
      return [
        {
          name: `${stem} (watermarked).pdf`,
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        },
      ];
    });
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept=".pdf,application/pdf"
          title="Drop a PDF here"
          hint="Stamp DRAFT, CONFIDENTIAL or anything you like across every page."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell
      tool={TOOL}
      caveat={
        <>
          A watermark sits on top of the page — it marks a document, it doesn’t
          protect it. Anyone determined enough can strip it off again.
        </>
      }
    >
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

        {job.result ? (
          <ResultCard
            files={job.result}
            headline={`Watermarked ${pdf.pageCount} ${pdf.pageCount === 1 ? "page" : "pages"}`}
            onStartOver={startOver}
          />
        ) : (
          pdf.doc && (
            <div className="grid gap-6 lg:grid-cols-[1fr_15rem]">
              <Card className="order-2 space-y-5 p-5 lg:order-1">
                <Field label="What should it say?">
                  {(id) => (
                    <TextInput
                      id={id}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="DRAFT"
                      maxLength={60}
                    />
                  )}
                </Field>

                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setText(preset)}
                      className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <Slider
                  label="Size"
                  min={16}
                  max={160}
                  step={4}
                  value={fontSize}
                  display={`${fontSize} pt`}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />

                <Slider
                  label="How faint"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round(opacity * 100)}
                  display={`${Math.round(opacity * 100)}%`}
                  onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                />

                <Slider
                  label="Angle"
                  min={0}
                  max={90}
                  step={5}
                  value={angle}
                  display={`${angle}°`}
                  onChange={(e) => setAngle(Number(e.target.value))}
                />

                <Field label="Colour">
                  {(id) => (
                    <div className="flex items-center gap-2">
                      <input
                        id={id}
                        type="color"
                        value={colour}
                        onChange={(e) => setColour(e.target.value)}
                        className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface p-1"
                      />
                      <TextInput
                        value={colour}
                        onChange={(e) => setColour(e.target.value)}
                        className="font-mono"
                      />
                    </div>
                  )}
                </Field>

                <Checkbox
                  label="Repeat it across the whole page"
                  checked={tile}
                  onChange={(e) => setTile(e.target.checked)}
                />

                {job.error && (
                  <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                    {job.error}
                  </Notice>
                )}

                <Button
                  variant="primary"
                  size="lg"
                  busy={job.busy}
                  disabled={!text.trim()}
                  onClick={apply}
                >
                  <Stamp className="size-4" aria-hidden />
                  Add the watermark
                </Button>
              </Card>

              <div className="order-1 lg:order-2 lg:sticky lg:top-24 lg:self-start">
                <p className="mb-2 text-sm font-medium text-ink">Preview</p>
                <div className="relative max-w-[15rem] overflow-hidden rounded border border-line">
                  <PdfThumb doc={pdf.doc} page={1} width={240} />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
                    <span
                      className="font-bold whitespace-nowrap select-none"
                      style={{
                        color: colour,
                        opacity,
                        // The thumbnail is ~240px wide against a ~595pt page,
                        // so scale the point size into preview pixels.
                        fontSize: `${fontSize * 0.4}px`,
                        transform: `rotate(-${angle}deg)`,
                      }}
                    >
                      {text || "DRAFT"}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {tile
                    ? "Tiling repeats this across the page — the preview shows one copy."
                    : "An approximation. The real output uses the PDF’s own fonts."}
                </p>
              </div>
            </div>
          )
        )}
      </div>
    </ToolShell>
  );
}
