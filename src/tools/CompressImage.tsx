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
import { formatBytes } from "../lib/files";
import {
  decodeImage,
  encodeCanvas,
  FORMAT_EXTENSIONS,
  transformImage,
  type OutputFormat,
} from "../lib/image";
import { scaleSize } from "../lib/imageMath";
import { getTool } from "../lib/registry";
import { findBestSetting, parseSize, SIZE_PRESETS } from "../lib/sizeTarget";
import { BatchImageTool, outputName } from "./image/BatchImageTool";

const TOOL = getTool("compress-image")!;

type Mode = "quality" | "target";

export default function CompressImage() {
  const [mode, setMode] = useState<Mode>("quality");
  const [format, setFormat] = useState<Exclude<OutputFormat, "png">>("jpeg");
  const [quality, setQuality] = useState(0.75);
  const [target, setTarget] = useState("500 KB");
  const [shrink, setShrink] = useState(100);
  const [keepFormat, setKeepFormat] = useState(false);

  const targetBytes = parseSize(target);

  return (
    <BatchImageTool
      tool={TOOL}
      dropTitle="Drop your pictures here"
      dropHint="Make them smaller — either by quality, or to hit an exact size limit."
      actionLabel={(n) => (n === 1 ? "Compress it" : `Compress all ${n}`)}
      options={() => (
        <>
          <Card className="space-y-5 p-5">
            <SegmentedControl
              options={[
                { value: "quality", label: "By quality" },
                { value: "target", label: "To a size limit" },
              ]}
              value={mode}
              onChange={(v) => setMode(v as Mode)}
            />

            {mode === "quality" ? (
              <>
                <Slider
                  label="Quality"
                  min={20}
                  max={95}
                  step={5}
                  value={Math.round(quality * 100)}
                  display={`${Math.round(quality * 100)}%`}
                  onChange={(e) => setQuality(Number(e.target.value) / 100)}
                />
                <p className="text-xs leading-relaxed text-muted">
                  {quality >= 0.85
                    ? "Barely distinguishable from the original."
                    : quality >= 0.7
                      ? "A good balance — most people see no difference."
                      : quality >= 0.5
                        ? "Noticeably softer, but perfectly readable on screen."
                        : "Visibly degraded. Only worth it against a hard limit."}
                </p>
              </>
            ) : (
              <>
                <Field
                  label="Target size"
                  hint="Each picture is squeezed until it fits under this."
                >
                  {(id) => (
                    <TextInput
                      id={id}
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="500 KB"
                    />
                  )}
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  {SIZE_PRESETS.slice(0, 5).map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setTarget(p.label)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent touch:min-h-11"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {target && !targetBytes && (
                  <Notice tone="danger">Couldn’t read that as a size.</Notice>
                )}
              </>
            )}

            <Slider
              label="Also shrink the dimensions"
              min={25}
              max={100}
              step={5}
              value={shrink}
              display={shrink === 100 ? "keep original" : `${shrink}%`}
              onChange={(e) => setShrink(Number(e.target.value))}
            />
            <p className="-mt-2 text-xs leading-relaxed text-muted">
              A 4000px photo emailed or uploaded rarely needs to stay 4000px. Halving
              the dimensions cuts the file to roughly a quarter before quality is
              touched at all.
            </p>

            <Field label="Save as">
              {() => (
                <SegmentedControl
                  options={[
                    { value: "jpeg", label: "JPG" },
                    { value: "webp", label: "WebP" },
                    { value: "avif", label: "AVIF" },
                  ]}
                  value={format}
                  onChange={(v) => setFormat(v as Exclude<OutputFormat, "png">)}
                />
              )}
            </Field>

            <Checkbox
              label="Keep PNGs as PNG"
              checked={keepFormat}
              onChange={(e) => setKeepFormat(e.target.checked)}
            />
            <p className="-mt-2 pl-6 text-xs leading-relaxed text-muted">
              Useful for logos and screenshots with transparency, which JPG would
              flatten onto a solid background.
            </p>
          </Card>
        </>
      )}
      process={async (entry) => {
        const isPng = entry.file.type === "image/png";
        const outFormat: OutputFormat = keepFormat && isPng ? "png" : format;

        const bitmap = await decodeImage(entry.file);
        try {
          const size =
            shrink === 100
              ? undefined
              : scaleSize({ width: bitmap.width, height: bitmap.height }, shrink);

          const canvas = await transformImage(bitmap, {
            size,
            background: outFormat === "jpeg" ? "#ffffff" : null,
          });

          let blob: Blob;

          if (mode === "target" && targetBytes && outFormat !== "png") {
            const search = await findBestSetting(
              async (q) => {
                blob = await encodeCanvas(canvas, outFormat, q);
                return blob.size;
              },
              targetBytes,
              { min: 0.25, max: 0.95, maxAttempts: 7 },
            );
            blob = await encodeCanvas(canvas, outFormat, search.setting);
          } else {
            blob = await encodeCanvas(canvas, outFormat, quality);
          }

          return {
            name: outputName(entry.file, FORMAT_EXTENSIONS[outFormat]),
            blob: blob!,
            originalBytes: entry.file.size,
            size: { width: canvas.width, height: canvas.height },
          };
        } finally {
          bitmap.close();
        }
      }}
      summary={(results) => {
        const before = results.reduce((s, r) => s + r.originalBytes, 0);
        const after = results.reduce((s, r) => s + r.blob.size, 0);
        const saved = Math.round(((before - after) / before) * 100);
        return `${formatBytes(before)} → ${formatBytes(after)}${saved > 0 ? ` · ${saved}% smaller` : ""}`;
      }}
    />
  );
}
