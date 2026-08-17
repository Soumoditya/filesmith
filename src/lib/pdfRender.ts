import * as pdfjs from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * Rendering and text extraction, via pdf.js.
 *
 * pdf.js does its parsing in a worker of its own, so this runs on the main
 * thread without blocking it. Rendering has to happen here anyway — that's
 * where the canvas is.
 *
 * This is deliberately separate from `workers/pdf.worker.ts`, which uses
 * pdf-lib to *write* documents. The two libraries are good at opposite jobs:
 * pdf.js reads and draws, pdf-lib edits and saves.
 */

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export type PdfDoc = PDFDocumentProxy;

export class PasswordRequiredError extends Error {
  wrongPassword: boolean;

  constructor(wrongPassword: boolean) {
    super(wrongPassword ? "That password didn't work." : "This PDF needs a password.");
    this.name = "PasswordRequiredError";
    this.wrongPassword = wrongPassword;
  }
}

/** An open document plus the teardown that releases the pdf.js worker. */
export interface OpenPdf {
  doc: PdfDoc;
  close: () => Promise<void>;
}

/**
 * Opens a PDF for reading. Always call `close()` when finished — the
 * teardown lives on the loading task, not the document, and without it the
 * worker keeps its copy of the file.
 */
export async function openPdf(
  file: File | ArrayBuffer,
  password?: string,
): Promise<OpenPdf> {
  const data =
    file instanceof ArrayBuffer
      ? new Uint8Array(file)
      : new Uint8Array(await file.arrayBuffer());

  const task = pdfjs.getDocument({ data, password });

  try {
    const doc = await task.promise;
    return { doc, close: () => task.destroy() };
  } catch (err) {
    void task.destroy();
    if ((err as { name?: string })?.name === "PasswordException") {
      // code 1 means "needs a password", 2 means "that password was wrong".
      throw new PasswordRequiredError((err as { code?: number }).code === 2);
    }
    throw err;
  }
}

export interface PageSize {
  width: number;
  height: number;
  /** Rotation baked into the page, in degrees. */
  rotation: number;
}

export function pageSize(page: { getViewport: (p: { scale: number }) => { width: number; height: number; rotation: number } }): PageSize {
  const vp = page.getViewport({ scale: 1 });
  return { width: vp.width, height: vp.height, rotation: vp.rotation };
}

/**
 * Renders one page to a canvas.
 *
 * `targetWidth` is in CSS pixels; the canvas is drawn at device resolution so
 * thumbnails stay crisp on high-DPI screens.
 */
export async function renderPageToCanvas(
  doc: PdfDoc,
  pageNumber: number,
  targetWidth: number,
  extraRotation = 0,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1, rotation: page.rotate + extraRotation });
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const scale = (targetWidth / base.width) * dpr;
  const viewport = page.getViewport({ scale, rotation: page.rotate + extraRotation });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Your browser wouldn't give us a canvas to draw on.");

  // Pages are transparent by default; without this, a white page renders black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  page.cleanup();

  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/jpeg" | "image/webp",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't turn the page into an image."))),
      type,
      quality,
    );
  });
}

/** Plain text of one page, with pdf.js's own line breaks preserved. */
export async function pageText(doc: PdfDoc, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();

  let out = "";
  for (const item of content.items) {
    if (!("str" in item)) continue;
    out += item.str;
    if (item.hasEOL) out += "\n";
  }

  page.cleanup();
  return out;
}

/**
 * True if the document has essentially no extractable text — the signal that
 * a PDF is a scan and needs OCR rather than text extraction.
 */
export async function looksLikeAScan(doc: PdfDoc, samplePages = 3): Promise<boolean> {
  const pages = Math.min(samplePages, doc.numPages);
  let chars = 0;
  for (let i = 1; i <= pages; i++) {
    chars += (await pageText(doc, i)).trim().length;
  }
  return chars < 40 * pages;
}
