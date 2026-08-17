import { ClipboardCopy } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { ToolShell } from "../components/ToolShell";
import { Button, Card, SegmentedControl, Slider, Spinner, Textarea } from "../components/ui";
import { claimFiles } from "../lib/handoff";
import { samplePixels } from "../lib/image";
import { extractPalette, luminance, type Swatch } from "../lib/imageMath";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";

const TOOL = getTool("palette-extractor")!;

type Format = "hex" | "rgb" | "css" | "tailwind";

function asText(swatches: Swatch[], format: Format): string {
  switch (format) {
    case "hex":
      return swatches.map((s) => s.hex).join("\n");
    case "rgb":
      return swatches.map((s) => `rgb(${s.rgb.join(", ")})`).join("\n");
    case "css":
      return [
        ":root {",
        ...swatches.map((s, i) => `  --colour-${i + 1}: ${s.hex};`),
        "}",
      ].join("\n");
    case "tailwind":
      return [
        "@theme {",
        ...swatches.map((s, i) => `  --color-brand-${(i + 1) * 100}: ${s.hex};`),
        "}",
      ].join("\n");
  }
}

export default function PaletteExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [count, setCount] = useState(6);
  const [format, setFormat] = useState<Format>("hex");
  const [copied, setCopied] = useState<string | null>(null);
  const job = useToolJob<Swatch[]>();

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  // Re-extract whenever the picture or the colour count changes.
  useEffect(() => {
    if (!file) return;
    void job.run(async () => extractPalette(await samplePixels(file), count));
    // Including `job` would loop; it is stable in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, count]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1600);
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept="image/*,.heic,.heif"
          title="Drop a picture here"
          hint="Pull out its main colours as hex codes, ready to paste."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <FileHeader
          file={file}
          onClear={() => {
            setFile(null);
            job.reset();
          }}
        />

        <div className="grid gap-5 sm:grid-cols-[13rem_minmax(0,1fr)]">
          {url && (
            <img
              src={url}
              alt="Your picture"
              className="checkerboard w-full rounded-card border border-line object-cover"
              style={{ maxHeight: 220 }}
            />
          )}

          <Card className="space-y-4 p-4">
            <Slider
              label="How many colours?"
              min={3}
              max={10}
              step={1}
              value={count}
              display={String(count)}
              onChange={(e) => setCount(Number(e.target.value))}
            />

            {job.busy && (
              <div className="flex items-center gap-3 text-sm text-muted">
                <Spinner /> Reading the colours…
              </div>
            )}

            {job.result && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {job.result.map((swatch) => (
                  <button
                    key={swatch.hex}
                    type="button"
                    onClick={() => copy(swatch.hex)}
                    title="Click to copy"
                    className="group relative overflow-hidden rounded-lg border border-line text-left transition-transform hover:scale-[1.02]"
                    style={{ backgroundColor: swatch.hex }}
                  >
                    <span
                      className="block px-2.5 pt-8 pb-2 font-mono text-xs font-medium"
                      style={{
                        color: luminance(swatch.rgb) > 0.55 ? "#101010" : "#ffffff",
                      }}
                    >
                      {copied === swatch.hex ? "copied" : swatch.hex}
                      <span className="mt-0.5 block opacity-70">
                        {Math.round(swatch.share * 100)}%
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {job.result && job.result.length > 0 && (
          <Card className="space-y-3 p-5">
            <div className="scroll-x -mx-1 px-1">
              <SegmentedControl
                options={[
                  { value: "hex", label: "Hex" },
                  { value: "rgb", label: "RGB" },
                  { value: "css", label: "CSS" },
                  { value: "tailwind", label: "Tailwind" },
                ]}
                value={format}
                onChange={(v) => setFormat(v as Format)}
              />
            </div>

            <Textarea
              readOnly
              rows={Math.min(job.result.length + 2, 12)}
              value={asText(job.result, format)}
              className="font-mono text-xs"
              aria-label="The palette as text"
            />

            <Button onClick={() => copy(asText(job.result!, format))}>
              <ClipboardCopy className="size-4" aria-hidden />
              {copied === asText(job.result, format) ? "Copied" : "Copy all"}
            </Button>
          </Card>
        )}
      </div>
    </ToolShell>
  );
}
