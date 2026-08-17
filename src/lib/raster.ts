import {
  canvasToBlob,
  openPdf,
  pageText,
  renderPageToCanvas,
  type PdfDoc,
} from "./pdfRender";
import { findBestSetting } from "./sizeTarget";

/**
 * Turning PDF pages into pictures, and back again.
 *
 * Rendering needs a canvas, so this runs on the main thread — pdf.js does its
 * parsing in its own worker, so the UI stays responsive regardless. Rebuilding
 * a PDF from the results happens in the pdf-lib worker.
 */

export type ImageFormat = "png" | "jpeg" | "webp";

export interface RasterOptions {
  /** Dots per inch. PDF points are 1/72 inch, so 150 DPI is scale 2.08. */
  dpi: number;
  format: ImageFormat;
  /** 0-1, ignored for PNG. */
  quality: number;
  /** 1-based page numbers; all pages when omitted. */
  pages?: number[];
}

export interface RenderedPage {
  page: number;
  blob: Blob;
  width: number;
  height: number;
  /** The page's size in PDF points, needed to rebuild at the original size. */
  pointWidth: number;
  pointHeight: number;
}

const MIME: Record<ImageFormat, "image/png" | "image/jpeg" | "image/webp"> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const dpiToScale = (dpi: number) => dpi / 72;

/** Renders the requested pages to images. */
export async function renderPdfPages(
  file: File,
  options: RasterOptions,
  onProgress?: (done: number, total: number) => void,
  password?: string,
): Promise<RenderedPage[]> {
  const opened = await openPdf(file, password);

  try {
    const pages =
      options.pages ?? Array.from({ length: opened.doc.numPages }, (_, i) => i + 1);
    const out: RenderedPage[] = [];

    for (const [index, pageNumber] of pages.entries()) {
      const page = await opened.doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      page.cleanup();

      const targetWidth = viewport.width * dpiToScale(options.dpi);
      const canvas = await renderPageToCanvas(opened.doc, pageNumber, targetWidth);
      const blob = await canvasToBlob(
        canvas,
        MIME[options.format],
        options.format === "png" ? undefined : options.quality,
      );

      out.push({
        page: pageNumber,
        blob,
        width: canvas.width,
        height: canvas.height,
        pointWidth: viewport.width,
        pointHeight: viewport.height,
      });

      onProgress?.(index + 1, pages.length);
    }

    return out;
  } finally {
    await opened.close();
  }
}

/** Every page's text, in order. */
export async function extractPdfText(
  file: File,
  onProgress?: (done: number, total: number) => void,
  password?: string,
): Promise<string[]> {
  const opened = await openPdf(file, password);

  try {
    const out: string[] = [];
    for (let i = 1; i <= opened.doc.numPages; i++) {
      out.push(await pageText(opened.doc, i));
      onProgress?.(i, opened.doc.numPages);
    }
    return out;
  } finally {
    await opened.close();
  }
}

/** True when a document has almost no extractable text — i.e. it's a scan. */
export async function isProbablyScanned(doc: PdfDoc): Promise<boolean> {
  const sample = Math.min(3, doc.numPages);
  let characters = 0;
  for (let i = 1; i <= sample; i++) characters += (await pageText(doc, i)).trim().length;
  return characters < 40 * sample;
}

export interface CompressResult {
  pages: RenderedPage[];
  dpi: number;
  quality: number;
  bytes: number;
  achieved: boolean;
}

/**
 * Renders a document repeatedly, hunting for the settings that land just
 * under a size limit.
 *
 * Quality is traded first because it degrades a page far more gracefully than
 * resolution does: a slightly soft JPEG still reads, whereas a 40 DPI page
 * doesn't. Only when quality alone can't get there does the DPI come down.
 */
export async function compressPdfToTarget(
  file: File,
  targetBytes: number,
  options: {
    startDpi?: number;
    minDpi?: number;
    format?: "jpeg" | "webp";
    onAttempt?: (attempt: number, bytes: number) => void;
  } = {},
): Promise<CompressResult> {
  const format = options.format ?? "jpeg";
  const startDpi = options.startDpi ?? 150;
  const minDpi = options.minDpi ?? 72;

  const sizeAt = async (dpi: number, quality: number) => {
    const pages = await renderPdfPages(file, { dpi, format, quality });
    const bytes = pages.reduce((sum, p) => sum + p.blob.size, 0);
    return { pages, bytes };
  };

  let attempt = 0;

  for (const dpi of [startDpi, Math.round((startDpi + minDpi) / 2), minDpi]) {
    let lastPages: RenderedPage[] = [];
    let lastBytes = 0;

    const search = await findBestSetting(
      async (quality) => {
        attempt++;
        const result = await sizeAt(dpi, quality);
        lastPages = result.pages;
        lastBytes = result.bytes;
        options.onAttempt?.(attempt, result.bytes);
        // The PDF wrapper adds overhead beyond the raw images; budget for it
        // so the finished file, not just its pictures, comes in under the cap.
        return Math.round(result.bytes * 1.06);
      },
      targetBytes,
      { min: 0.35, max: 0.92, maxAttempts: 6 },
    );

    if (search.achieved) {
      // Re-render at the winning setting: the search's last probe may have
      // been a rejected one.
      const final = await sizeAt(dpi, search.setting);
      return {
        pages: final.pages,
        dpi,
        quality: search.setting,
        bytes: final.bytes,
        achieved: true,
      };
    }

    // Carry the best attempt at this DPI forward in case nothing works.
    if (dpi === minDpi) {
      return { pages: lastPages, dpi, quality: 0.35, bytes: lastBytes, achieved: false };
    }
  }

  // Unreachable, but keeps the return type honest.
  const fallback = await sizeAt(minDpi, 0.35);
  return {
    pages: fallback.pages,
    dpi: minDpi,
    quality: 0.35,
    bytes: fallback.bytes,
    achieved: false,
  };
}

/** Shrinks a single image to fit a size limit, trading quality then scale. */
export async function compressImageToTarget(
  source: Blob,
  targetBytes: number,
  options: { format?: "jpeg" | "webp"; maxScale?: number } = {},
): Promise<{ blob: Blob; quality: number; scale: number; achieved: boolean }> {
  const format = options.format ?? "jpeg";
  const bitmap = await createImageBitmap(source);

  const encode = async (scale: number, quality: number): Promise<Blob> => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser wouldn't give us a canvas to draw on.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas, `image/${format}` as "image/jpeg" | "image/webp", quality);
  };

  try {
    for (const scale of [1, 0.75, 0.5, 0.35, 0.25]) {
      if (scale > (options.maxScale ?? 1)) continue;

      let best: Blob | null = null;
      const search = await findBestSetting(
        async (quality) => {
          best = await encode(scale, quality);
          return best.size;
        },
        targetBytes,
        { min: 0.3, max: 0.94, maxAttempts: 6 },
      );

      if (search.achieved) {
        const blob = await encode(scale, search.setting);
        return { blob, quality: search.setting, scale, achieved: true };
      }

      if (scale === 0.25 && best) {
        return { blob: best, quality: 0.3, scale, achieved: false };
      }
    }

    const blob = await encode(0.25, 0.3);
    return { blob, quality: 0.3, scale: 0.25, achieved: false };
  } finally {
    bitmap.close();
  }
}
