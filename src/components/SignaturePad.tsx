import { Eraser } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui";

/**
 * Draw a signature with a finger, a stylus or a mouse.
 *
 * Strokes are captured as points and redrawn, rather than painted straight
 * onto the canvas, so undo works and the whole thing can be re-rendered at
 * print resolution — a signature drawn at 600px wide would look ragged on a
 * printed page otherwise.
 */

type Stroke = Array<{ x: number; y: number }>;

export function SignaturePad({
  onChange,
  colour = "#101010",
  height = 180,
}: {
  /** A transparent PNG at print resolution, or null once cleared. */
  onChange: (png: Blob | null) => void;
  colour?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawing = useRef<Stroke | null>(null);

  const paint = useCallback(
    (target: HTMLCanvasElement, scale: number, transparent: boolean) => {
      const ctx = target.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, target.width, target.height);
      if (!transparent) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, target.width, target.height);
      }

      ctx.strokeStyle = colour;
      ctx.lineWidth = 2.4 * scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const stroke of strokes) {
        if (stroke.length === 0) continue;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x * target.width, stroke[0].y * target.height);
        // Midpoint smoothing: raw pointer samples are visibly jagged.
        for (let i = 1; i < stroke.length; i++) {
          const previous = stroke[i - 1];
          const current = stroke[i];
          const midX = ((previous.x + current.x) / 2) * target.width;
          const midY = ((previous.y + current.y) / 2) * target.height;
          ctx.quadraticCurveTo(
            previous.x * target.width,
            previous.y * target.height,
            midX,
            midY,
          );
        }
        ctx.stroke();
      }
    },
    [strokes, colour],
  );

  // Redraw the on-screen pad whenever the strokes change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    paint(canvas, dpr, false);
  }, [paint]);

  // Export at 4x so the signature stays crisp when printed.
  useEffect(() => {
    if (strokes.length === 0) {
      onChange(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const out = document.createElement("canvas");
    out.width = Math.round(rect.width * 4);
    out.height = Math.round(rect.height * 4);
    paint(out, 4, true);
    out.toBlob((blob) => onChange(blob), "image/png");
  }, [strokes, paint, onChange]);

  const position = (event: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        style={{ height }}
        className="checkerboard w-full cursor-crosshair touch-none rounded-lg border-2 border-dashed border-line-strong"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drawing.current = [position(e)];
          setStrokes((s) => [...s, drawing.current!]);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          drawing.current.push(position(e));
          // Replace the last stroke so React sees a change.
          setStrokes((s) => [...s.slice(0, -1), [...drawing.current!]]);
        }}
        onPointerUp={() => {
          drawing.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = null;
        }}
        aria-label="Draw your signature here"
      />

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {strokes.length === 0 ? "Sign in the box above." : "Looks good?"}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={strokes.length === 0}
            onClick={() => setStrokes((s) => s.slice(0, -1))}
          >
            Undo
          </Button>
          <Button size="sm" disabled={strokes.length === 0} onClick={() => setStrokes([])}>
            <Eraser className="size-4" aria-hidden />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
