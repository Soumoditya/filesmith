import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderPageToCanvas, type PdfDoc } from "../lib/pdfRender";
import { Spinner } from "./ui";

/**
 * A page you can draw boxes on.
 *
 * Shared by signing, redaction and text editing, which all need the same
 * thing: see the page, mark a rectangle on it, and get that rectangle back in
 * PDF coordinates. Everything is stored as a fraction of the page, so a box
 * drawn on a 700px-wide preview lands in the right place on A4 or Letter, and
 * survives the window being resized.
 */

export interface Box {
  id: string;
  page: number;
  /** All 0-1, measured from the top-left of the page. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageGeometry {
  /** Page size in PDF points. */
  width: number;
  height: number;
}

/** Converts a fractional box to PDF points, flipping to a bottom-left origin. */
export function boxToPoints(box: Box, page: PageGeometry) {
  return {
    x: box.x * page.width,
    y: (1 - box.y - box.height) * page.height,
    width: box.width * page.width,
    height: box.height * page.height,
  };
}

const MIN_SIZE = 0.008;

export function PageCanvas({
  doc,
  page,
  boxes,
  onAdd,
  onSelect,
  selectedId,
  onRemove,
  width = 700,
  mode = "draw",
  boxClassName,
  label,
}: {
  doc: PdfDoc;
  /** 1-based. */
  page: number;
  boxes: Box[];
  onAdd?: (box: Omit<Box, "id">) => void;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  onRemove?: (id: string) => void;
  width?: number;
  /** `draw` drags out a rectangle; `point` drops a fixed-size box on click. */
  mode?: "draw" | "point";
  boxClassName?: string;
  label?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const surface = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setSrc(null);

    renderPageToCanvas(doc, page, width)
      .then((canvas) => {
        if (cancelled) return;
        canvas.toBlob((blob) => {
          if (cancelled || !blob) return;
          url = URL.createObjectURL(blob);
          setSrc(url);
        }, "image/webp");
      })
      .catch(() => {
        /* The surrounding tool reports load failures. */
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, page, width]);

  /** Pointer position as a fraction of the page. */
  const fraction = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = surface.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
  }, []);

  const handleDown = (event: React.PointerEvent) => {
    if (!onAdd) return;
    const point = fraction(event);

    if (mode === "point") {
      // Centre a default-sized box on the click.
      onAdd({ page, x: Math.max(point.x - 0.09, 0), y: Math.max(point.y - 0.03, 0), width: 0.18, height: 0.06 });
      return;
    }

    (event.target as Element).setPointerCapture?.(event.pointerId);
    start.current = point;
    setDrag({ x: point.x, y: point.y, w: 0, h: 0 });
  };

  const handleMove = (event: React.PointerEvent) => {
    if (!start.current) return;
    const point = fraction(event);
    setDrag({
      x: Math.min(start.current.x, point.x),
      y: Math.min(start.current.y, point.y),
      w: Math.abs(point.x - start.current.x),
      h: Math.abs(point.y - start.current.y),
    });
  };

  const handleUp = () => {
    if (drag && onAdd && drag.w > MIN_SIZE && drag.h > MIN_SIZE) {
      onAdd({ page, x: drag.x, y: drag.y, width: drag.w, height: drag.h });
    }
    start.current = null;
    setDrag(null);
  };

  const pageBoxes = boxes.filter((b) => b.page === page);

  return (
    <div className="relative inline-block max-w-full">
      <div
        ref={surface}
        role={onAdd ? "application" : undefined}
        aria-label={label}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        className={clsx(
          "relative touch-none overflow-hidden rounded border border-line bg-surface select-none",
          onAdd && (mode === "draw" ? "cursor-crosshair" : "cursor-copy"),
        )}
        style={{ width, maxWidth: "100%" }}
      >
        {src ? (
          <img src={src} alt={`Page ${page}`} className="block w-full" draggable={false} />
        ) : (
          <div className="grid aspect-[1/1.414] place-items-center">
            <Spinner />
          </div>
        )}

        {pageBoxes.map((box) => (
          <button
            key={box.id}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSelect?.(box.id)}
            onDoubleClick={() => onRemove?.(box.id)}
            title="Click to select, double-click to remove"
            className={clsx(
              "absolute border-2 transition-colors",
              selectedId === box.id
                ? "border-accent bg-accent/20"
                : "border-accent/60 bg-accent/10 hover:bg-accent/20",
              boxClassName,
            )}
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          />
        ))}

        {drag && drag.w > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-accent bg-accent/20"
            style={{
              left: `${drag.x * 100}%`,
              top: `${drag.y * 100}%`,
              width: `${drag.w * 100}%`,
              height: `${drag.h * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Page navigation shared by the canvas tools. */
export function PageStepper({
  page,
  total,
  onChange,
  marked,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  /** Pages that already have boxes on them, so they're findable. */
  marked?: number[];
}) {
  if (total <= 1) return null;

  return (
    <div className="scroll-x">
      <div className="flex w-max gap-1.5 py-1">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={clsx(
              "relative h-9 min-w-9 rounded-lg border px-2.5 text-sm font-medium transition-colors touch:h-11 touch:min-w-11",
              n === page
                ? "border-accent bg-accent-wash text-accent"
                : "border-line text-muted hover:text-ink",
            )}
          >
            {n}
            {marked?.includes(n) && (
              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
