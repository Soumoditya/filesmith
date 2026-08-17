import { useState } from "react";
import { Card, Field, Notice, SegmentedControl, Slider } from "../components/ui";
import { formatBytes } from "../lib/files";
import {
  FORMAT_EXTENSIONS,
  FORMAT_LABELS,
  FORMAT_NOTES,
  needsHeicDecode,
  processImage,
  type OutputFormat,
} from "../lib/image";
import { getTool } from "../lib/registry";
import { BatchImageTool, outputName } from "./image/BatchImageTool";

const TOOL = getTool("convert-image")!;

const FORMATS: OutputFormat[] = ["jpeg", "png", "webp", "avif"];

export default function ConvertImage() {
  const [format, setFormat] = useState<OutputFormat>("jpeg");
  const [quality, setQuality] = useState(0.85);
  const [background, setBackground] = useState("#ffffff");

  return (
    <BatchImageTool
      tool={TOOL}
      dropTitle="Drop your pictures here"
      dropHint="JPG, PNG, WebP, AVIF, GIF, BMP and iPhone HEIC photos."
      actionLabel={(n) => `Convert ${n} to ${FORMAT_LABELS[format]}`}
      options={(entries) => {
        const heic = entries.filter((e) => needsHeicDecode(e.file)).length;

        return (
          <>
            <Card className="space-y-5 p-5">
              <Field label="Convert to">
                {() => (
                  <SegmentedControl
                    options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
                    value={format}
                    onChange={(v) => setFormat(v as OutputFormat)}
                  />
                )}
              </Field>

              <p className="text-xs leading-relaxed text-muted">{FORMAT_NOTES[format]}</p>

              {format !== "png" && (
                <Slider
                  label="Quality"
                  min={30}
                  max={100}
                  step={5}
                  value={Math.round(quality * 100)}
                  display={`${Math.round(quality * 100)}%`}
                  onChange={(e) => setQuality(Number(e.target.value) / 100)}
                />
              )}

              {format === "jpeg" && (
                <Field
                  label="Background behind transparency"
                  hint="JPG can't be transparent, so see-through areas need a colour."
                >
                  {(id) => (
                    <div className="flex items-center gap-2">
                      <input
                        id={id}
                        type="color"
                        value={background}
                        onChange={(e) => setBackground(e.target.value)}
                        className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface p-1 touch:h-11 touch:w-14"
                      />
                      <span className="text-xs text-muted">{background}</span>
                    </div>
                  )}
                </Field>
              )}

              {format === "avif" && (
                <Notice>
                  AVIF makes the smallest files, but it’s slow to create — expect a
                  few seconds per picture — and older phones and software can’t open
                  it. Use WebP if the file has to work everywhere.
                </Notice>
              )}
            </Card>

            {heic > 0 && (
              <Notice>
                {heic === 1 ? "One picture is" : `${heic} pictures are`} in Apple’s HEIC
                format, which most websites reject. Converting to JPG or PNG fixes
                that — a codec is downloaded the first time, then cached.
              </Notice>
            )}
          </>
        );
      }}
      process={async (entry) => {
        const { blob, width, height } = await processImage(
          entry.file,
          { background },
          format,
          quality,
        );
        return {
          name: outputName(entry.file, FORMAT_EXTENSIONS[format]),
          blob,
          originalBytes: entry.file.size,
          size: { width, height },
        };
      }}
      summary={(results) => {
        const before = results.reduce((s, r) => s + r.originalBytes, 0);
        const after = results.reduce((s, r) => s + r.blob.size, 0);
        const change = Math.round(((before - after) / before) * 100);
        return `${formatBytes(before)} → ${formatBytes(after)}${
          change > 0 ? ` · ${change}% smaller` : change < 0 ? ` · ${-change}% larger` : ""
        }`;
      }}
    />
  );
}
