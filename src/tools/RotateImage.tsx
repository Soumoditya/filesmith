import { FlipHorizontal, FlipVertical, RotateCcw, RotateCw } from "lucide-react";
import { useState } from "react";
import { Button, Card, Field, Slider } from "../components/ui";
import {
  decodeImage,
  encodeCanvas,
  FORMAT_EXTENSIONS,
  transformImage,
  type OutputFormat,
} from "../lib/image";
import { getTool } from "../lib/registry";
import { BatchImageTool, outputName } from "./image/BatchImageTool";

const TOOL = getTool("rotate-image")!;

export default function RotateImage() {
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(90);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [quality, setQuality] = useState(0.92);

  const turn = (delta: number) =>
    setRotate((((rotate + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270);

  return (
    <BatchImageTool
      tool={TOOL}
      dropTitle="Drop your pictures here"
      dropHint="Turn sideways photos the right way up, or mirror them."
      actionLabel={(n) => (n === 1 ? "Save it" : `Save all ${n}`)}
      options={() => (
        <Card className="space-y-5 p-5">
          <Field label="Turn">
            {() => (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => turn(-90)} aria-label="Turn left">
                  <RotateCcw className="size-4" aria-hidden />
                  Left
                </Button>
                <Button onClick={() => turn(90)} aria-label="Turn right">
                  <RotateCw className="size-4" aria-hidden />
                  Right
                </Button>
                <span className="rounded-lg border border-line px-3 py-2 font-mono text-sm text-muted">
                  {rotate}°
                </span>
                {rotate !== 0 && (
                  <Button size="sm" onClick={() => setRotate(0)}>
                    Reset
                  </Button>
                )}
              </div>
            )}
          </Field>

          <Field label="Mirror">
            {() => (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={flipH ? "primary" : "secondary"}
                  onClick={() => setFlipH((v) => !v)}
                >
                  <FlipHorizontal className="size-4" aria-hidden />
                  Left to right
                </Button>
                <Button
                  variant={flipV ? "primary" : "secondary"}
                  onClick={() => setFlipV((v) => !v)}
                >
                  <FlipVertical className="size-4" aria-hidden />
                  Top to bottom
                </Button>
              </div>
            )}
          </Field>

          <p className="text-xs leading-relaxed text-muted">
            Rotating a JPG here re-saves the picture rather than just changing the
            orientation flag, so it turns the right way in every viewer — including
            the ones that ignore the flag entirely.
          </p>

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
            rotate,
            flipHorizontal: flipH,
            flipVertical: flipV,
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
    />
  );
}
