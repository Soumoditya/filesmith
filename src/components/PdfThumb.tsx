import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import {
  openPdf,
  PasswordRequiredError,
  renderPageToCanvas,
  type PdfDoc,
} from "../lib/pdfRender";

/* -------------------------------------------------------------------------
   Opening a document and drawing its pages, shared by every tool that shows
   a page grid.
   ------------------------------------------------------------------------- */

export interface PdfState {
  doc: PdfDoc | null;
  pageCount: number;
  loading: boolean;
  /** Set when the file is encrypted and we need a password from the user. */
  needsPassword: boolean;
  /** True once a supplied password has been rejected. */
  badPassword: boolean;
  error: string | null;
}

const IDLE: PdfState = {
  doc: null,
  pageCount: 0,
  loading: false,
  needsPassword: false,
  badPassword: false,
  error: null,
};

/** Opens `file`, and tears the document down when it changes or unmounts. */
export function usePdfDocument(file: File | null, password?: string): PdfState {
  const [state, setState] = useState<PdfState>(IDLE);

  useEffect(() => {
    if (!file) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    let close: (() => Promise<void>) | null = null;
    setState({ ...IDLE, loading: true });

    openPdf(file, password)
      .then((opened) => {
        close = opened.close;
        if (cancelled) {
          void opened.close();
          return;
        }
        setState({ ...IDLE, doc: opened.doc, pageCount: opened.doc.numPages });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PasswordRequiredError) {
          setState({
            ...IDLE,
            needsPassword: true,
            badPassword: err.wrongPassword,
          });
          return;
        }
        setState({
          ...IDLE,
          error:
            "This file couldn’t be opened as a PDF. It may be damaged, or it may not really be a PDF.",
        });
      });

    return () => {
      cancelled = true;
      // Releases the pdf.js worker's copy of the file. Without this, opening
      // several large PDFs in a row leaks memory.
      void close?.();
    };
  }, [file, password]);

  return state;
}

/**
 * One page, drawn only once it's close to the viewport. A 500-page document
 * would otherwise render 500 canvases up front and lock the tab.
 */
export function PdfThumb({
  doc,
  page,
  rotation = 0,
  width = 160,
  className,
}: {
  doc: PdfDoc;
  page: number;
  rotation?: number;
  width?: number;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = holder.current;
    if (!node || visible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    renderPageToCanvas(doc, page, width, rotation)
      .then((canvas) => {
        if (cancelled) return;
        canvas.toBlob((blob) => {
          if (cancelled || !blob) return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }, "image/webp");
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc, page, rotation, width, visible]);

  return (
    <div
      ref={holder}
      className={clsx(
        "checkerboard relative grid place-items-center overflow-hidden rounded bg-sunken",
        className,
      )}
      style={{ aspectRatio: "1 / 1.414" }}
    >
      {url ? (
        <img
          src={url}
          alt={`Page ${page}`}
          className="h-full w-full object-contain"
          draggable={false}
        />
      ) : failed ? (
        <span className="px-2 text-center text-xs text-muted">Can’t show this page</span>
      ) : (
        <span className="size-5 animate-pulse rounded-full bg-line-strong" aria-hidden />
      )}
    </div>
  );
}
