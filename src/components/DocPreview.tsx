import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CoverageWarning } from "../lib/doc/fontStack";
import type { DocumentSpec } from "../lib/doc/model";
import { renderDocument } from "../lib/doc/render";
import { openPdf, renderPageToCanvas } from "../lib/pdfRender";
import { Notice, Spinner } from "./ui";

/**
 * Live preview of a generated document.
 *
 * The document is genuinely built and then re-rendered through pdf.js, so
 * what's on screen is the actual PDF rather than an HTML approximation that
 * drifts from the output. Rebuilds are debounced — a full render on every
 * keystroke would be both slow and pointless.
 */

export interface PreviewResult {
  bytes: Uint8Array;
  pageCount: number;
  warnings: CoverageWarning[];
}

export function useDocumentPreview(spec: DocumentSpec | null, delay = 500) {
  const [pages, setPages] = useState<string[]>([]);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the newest build may publish, so fast typing can't show a stale page.
  const generation = useRef(0);

  useEffect(() => {
    if (!spec) return;

    const mine = ++generation.current;
    setBuilding(true);

    const timer = setTimeout(async () => {
      const urls: string[] = [];
      try {
        const rendered = await renderDocument(spec);
        if (generation.current !== mine) return;

        const opened = await openPdf(rendered.bytes.slice().buffer as ArrayBuffer);
        try {
          for (let i = 1; i <= opened.doc.numPages; i++) {
            const canvas = await renderPageToCanvas(opened.doc, i, 620);
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/webp", 0.9),
            );
            if (blob) urls.push(URL.createObjectURL(blob));
            if (generation.current !== mine) return;
          }
        } finally {
          await opened.close();
        }

        if (generation.current !== mine) {
          for (const url of urls) URL.revokeObjectURL(url);
          return;
        }

        setPages((old) => {
          for (const url of old) URL.revokeObjectURL(url);
          return urls;
        });
        setResult(rendered);
        setError(null);
      } catch (err) {
        if (generation.current !== mine) return;
        for (const url of urls) URL.revokeObjectURL(url);
        setError(
          err instanceof Error
            ? `Couldn't build the preview: ${err.message}`
            : "Couldn't build the preview.",
        );
      } finally {
        if (generation.current === mine) setBuilding(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [spec, delay]);

  // Release the last set of images when the component goes away.
  useEffect(() => {
    return () => {
      generation.current++;
      setPages((old) => {
        for (const url of old) URL.revokeObjectURL(url);
        return [];
      });
    };
  }, []);

  return { pages, result, building, error };
}

export function DocPreview({
  pages,
  building,
  error,
  warnings,
  emptyMessage = "Your document appears here as you type.",
}: {
  pages: string[];
  building: boolean;
  error: string | null;
  warnings?: CoverageWarning[];
  emptyMessage?: string;
}) {
  return (
    <div className="space-y-3">
      {error && (
        <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
          {error}
        </Notice>
      )}

      {warnings?.map((warning) => (
        <Notice
          key={warning.kind + warning.detail}
          tone="warning"
          icon={<AlertTriangle className="size-4" />}
        >
          {warning.message}
        </Notice>
      ))}

      <div className="relative">
        {building && pages.length > 0 && (
          <div className="absolute top-2 right-2 z-10 rounded-full bg-canvas/90 px-2.5 py-1 text-xs text-muted shadow">
            Updating…
          </div>
        )}

        {pages.length === 0 ? (
          <div className="grid min-h-64 place-items-center rounded-card border border-line bg-sunken">
            {building ? (
              <div className="flex flex-col items-center gap-2">
                <Spinner />
                <p className="text-sm text-muted">Building the preview…</p>
              </div>
            ) : (
              <p className="px-6 text-center text-sm text-muted">{emptyMessage}</p>
            )}
          </div>
        ) : (
          <ol className="space-y-4">
            {pages.map((url, i) => (
              <li key={url} className="relative">
                <img
                  src={url}
                  alt={`Page ${i + 1}`}
                  className="w-full rounded border border-line shadow-sm"
                />
                {pages.length > 1 && (
                  <span className="absolute right-2 bottom-2 rounded bg-canvas/90 px-1.5 py-0.5 font-mono text-xs text-muted">
                    {i + 1}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
