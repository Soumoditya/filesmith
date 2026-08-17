import { useState } from "react";
import {
  Card,
  Checkbox,
  Field,
  Notice,
  SegmentedControl,
  Slider,
  TextInput,
} from "../components/ui";
import {
  decodeImage,
  encodeCanvas,
  FORMAT_EXTENSIONS,
  transformImage,
  type OutputFormat,
} from "../lib/image";
import { resolveSize, scaleSize, type FitMode } from "../lib/imageMath";
import { getTool } from "../lib/registry";
import { BatchImageTool, outputName } from "./image/BatchImageTool";

const TOOL = getTool("resize-image")!;

type Mode = "exact" | "percent" | "longest";

const PRESETS = [
  { label: "1080p", width: 1920, height: 1080 },
  { label: "720p", width: 1280, height: 720 },
  { label: "Instagram square", width: 1080, height: 1080 },
  { label: "A4 at 300 DPI", width: 2480, height: 3508 },
];

export default function ResizeImage() {
  const [mode, setMode] = useState<Mode>("exact");
  const [width, setWidth] = useState<string>("1920");
  const [height, setHeight] = useState<string>("");
  const [percent, setPercent] = useState(50);
  const [longest, setLongest] = useState(1600);
  const [keepRatio, setKeepRatio] = useState(true);
  const [fit, setFit] = useState<FitMode>("contain");
  const [noUpscale, setNoUpscale] = useState(true);
  const [quality, setQuality] = useState(0.9);

  return (
    <BatchImageTool
      tool={TOOL}
      dropTitle="Drop your pictures here"
      dropHint="Set an exact size, scale by percentage, or cap the longest edge."
      actionLabel={(n) => (n === 1 ? "Resize it" : `Resize all ${n}`)}
      options={() => (
        <Card className="space-y-5 p-5">
          <SegmentedControl
            options={[
              { value: "exact", label: "Exact size" },
              { value: "percent", label: "Percentage" },
              { value: "longest", label: "Longest edge" },
            ]}
            value={mode}
            onChange={(v) => setMode(v as Mode)}
          />

          {mode === "exact" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Width" hint="Leave blank to follow the height.">
                  {(id) => (
                    <TextInput
                      id={id}
                      type="number"
                      inputMode="numeric"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder="auto"
                    />
                  )}
                </Field>
                <Field label="Height" hint="Leave blank to follow the width.">
                  {(id) => (
                    <TextInput
                      id={id}
                      type="number"
                      inputMode="numeric"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="auto"
                    />
                  )}
                </Field>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setWidth(String(p.width));
                      setHeight(String(p.height));
                    }}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent touch:min-h-11"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <Checkbox
                label="Keep the shape (don't stretch)"
                checked={keepRatio}
                onChange={(e) => setKeepRatio(e.target.checked)}
              />

              {!keepRatio && width && height && (
                <Field label="When the shape doesn't match">
                  {() => (
                    <SegmentedControl
                      options={[
                        { value: "contain", label: "Fit inside" },
                        { value: "cover", label: "Fill and crop" },
                        { value: "stretch", label: "Stretch" },
                      ]}
                      value={fit}
                      onChange={(v) => setFit(v as FitMode)}
                    />
                  )}
                </Field>
              )}
            </>
          )}

          {mode === "percent" && (
            <Slider
              label="Scale"
              min={5}
              max={300}
              step={5}
              value={percent}
              display={`${percent}%`}
              onChange={(e) => setPercent(Number(e.target.value))}
            />
          )}

          {mode === "longest" && (
            <>
              <Slider
                label="Longest edge"
                min={200}
                max={4000}
                step={50}
                value={longest}
                display={`${longest} px`}
                onChange={(e) => setLongest(Number(e.target.value))}
              />
              <p className="-mt-2 text-xs leading-relaxed text-muted">
                Handy for mixed batches: portraits and landscapes both end up
                sensibly sized without you working out each one.
              </p>
            </>
          )}

          <Checkbox
            label="Never make a picture bigger than it already is"
            checked={noUpscale}
            onChange={(e) => setNoUpscale(e.target.checked)}
          />
          {!noUpscale && (
            <Notice>
              Enlarging past the original adds no real detail — it just makes the
              existing pixels bigger and softer. For genuinely more detail you want{" "}
              <a href="/t/upscale-image" className="font-medium underline underline-offset-2">
                AI upscaling
              </a>
              , which is coming.
            </Notice>
          )}

          <Slider
            label="Quality"
            min={50}
            max={100}
            step={5}
            value={Math.round(quality * 100)}
            display={`${Math.round(quality * 100)}%`}
            onChange={(e) => setQuality(Number(e.target.value) / 100)}
          />
        </Card>
      )}
      process={async (entry) => {
        const bitmap = await decodeImage(entry.file);
        try {
          const source = { width: bitmap.width, height: bitmap.height };

          let size =
            mode === "percent"
              ? scaleSize(source, percent)
              : mode === "longest"
                ? source.width >= source.height
                  ? resolveSize(source, { width: longest }, true)
                  : resolveSize(source, { height: longest }, true)
                : resolveSize(
                    source,
                    {
                      width: width ? Number(width) : null,
                      height: height ? Number(height) : null,
                    },
                    keepRatio,
                  );

          if (noUpscale && (size.width > source.width || size.height > source.height)) {
            const scale = Math.min(source.width / size.width, source.height / size.height);
            size = {
              width: Math.max(1, Math.round(size.width * scale)),
              height: Math.max(1, Math.round(size.height * scale)),
            };
          }

          const isPng = entry.file.type === "image/png";
          const format: OutputFormat = isPng ? "png" : "jpeg";

          const canvas = await transformImage(bitmap, {
            size,
            fit: mode === "exact" && !keepRatio && width && height ? fit : "stretch",
            background: format === "jpeg" ? "#ffffff" : null,
          });

          return {
            name: outputName(entry.file, FORMAT_EXTENSIONS[format]),
            blob: await encodeCanvas(canvas, format, quality),
            originalBytes: entry.file.size,
            size: { width: canvas.width, height: canvas.height },
          };
        } finally {
          bitmap.close();
        }
      }}
      summary={(results) => {
        const first = results[0];
        return first?.size
          ? `Now ${first.size.width} × ${first.size.height}${results.length > 1 ? " and similar" : ""}`
          : undefined;
      }}
    />
  );
}
