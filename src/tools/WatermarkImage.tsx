import { useState } from "react";
import {
  Card,
  Checkbox,
  Field,
  Select,
  Slider,
  TextInput,
} from "../components/ui";
import {
  decodeImage,
  drawWatermark,
  encodeCanvas,
  FORMAT_EXTENSIONS,
  transformImage,
  type OutputFormat,
  type WatermarkOptions,
} from "../lib/image";
import { getTool } from "../lib/registry";
import { BatchImageTool, outputName } from "./image/BatchImageTool";

const TOOL = getTool("watermark-image")!;

const POSITIONS: Array<{ value: WatermarkOptions["position"]; label: string }> = [
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-centre", label: "Bottom, centred" },
  { value: "centre", label: "Middle" },
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" },
  { value: "top-centre", label: "Top, centred" },
];

export default function WatermarkImage() {
  const [text, setText] = useState("© Your Name");
  const [fontSize, setFontSize] = useState(32);
  const [colour, setColour] = useState("#ffffff");
  const [opacity, setOpacity] = useState(0.65);
  const [position, setPosition] = useState<WatermarkOptions["position"]>("bottom-right");
  const [margin, setMargin] = useState(24);
  const [rotate, setRotate] = useState(0);
  const [tile, setTile] = useState(false);
  const [quality, setQuality] = useState(0.9);

  return (
    <BatchImageTool
      tool={TOOL}
      dropTitle="Drop your pictures here"
      dropHint="Add your name or mark to a whole batch at once."
      caveat={
        <>
          A watermark marks a picture, it doesn’t protect it — anyone determined can
          crop or paint it out. Tiling across the middle is harder to remove than a
          corner mark, at the cost of being harder to look past.
        </>
      }
      actionLabel={(n) => (n === 1 ? "Add the watermark" : `Watermark all ${n}`)}
      options={() => (
        <Card className="space-y-5 p-5">
          <Field label="What should it say?">
            {(id) => (
              <TextInput
                id={id}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="© Your Name"
                maxLength={80}
              />
            )}
          </Field>

          <Field label="Where?">
            {(id) => (
              <Select
                id={id}
                value={position}
                disabled={tile}
                onChange={(e) =>
                  setPosition(e.target.value as WatermarkOptions["position"])
                }
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Checkbox
            label="Repeat across the whole picture"
            checked={tile}
            onChange={(e) => setTile(e.target.checked)}
          />

          <Slider
            label="Size"
            min={10}
            max={90}
            step={2}
            value={fontSize}
            display={`${fontSize}`}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
          <p className="-mt-2 text-xs leading-relaxed text-muted">
            Sized relative to the picture, so the same setting looks right on a
            small screenshot and on a large photo.
          </p>

          <Slider
            label="Opacity"
            min={10}
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
            value={rotate}
            display={`${rotate}°`}
            onChange={(e) => setRotate(Number(e.target.value))}
          />

          {!tile && (
            <Slider
              label="Distance from the edge"
              min={0}
              max={80}
              step={4}
              value={margin}
              display={`${margin}`}
              onChange={(e) => setMargin(Number(e.target.value))}
            />
          )}

          <Field label="Colour">
            {(id) => (
              <div className="flex items-center gap-2">
                <input
                  id={id}
                  type="color"
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface p-1 touch:h-11 touch:w-14"
                />
                <span className="text-xs text-muted">
                  White reads on most photos; black suits pale backgrounds.
                </span>
              </div>
            )}
          </Field>

          <Slider
            label="Quality"
            min={60}
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
          const isPng = entry.file.type === "image/png";
          const format: OutputFormat = isPng ? "png" : "jpeg";

          const canvas = await transformImage(bitmap, {
            background: format === "jpeg" ? "#ffffff" : null,
          });

          drawWatermark(canvas, {
            text,
            fontSize,
            colour,
            opacity,
            position,
            margin,
            rotate,
            tile,
          });

          return {
            name: outputName(entry.file, FORMAT_EXTENSIONS[format], " (marked)"),
            blob: await encodeCanvas(canvas, format, quality),
            originalBytes: entry.file.size,
            size: { width: canvas.width, height: canvas.height },
          };
        } finally {
          bitmap.close();
        }
      }}
    />
  );
}
