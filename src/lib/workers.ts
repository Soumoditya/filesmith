import * as Comlink from "comlink";
import type { PdfWorkerApi } from "../workers/pdf.worker";

/**
 * Lazily-spawned, then reused. Workers are cheap to keep around but not free
 * to start, and a user merging three PDFs in a row shouldn't pay the startup
 * cost each time.
 */

let pdfWorker: Comlink.Remote<PdfWorkerApi> | null = null;

export function getPdfWorker(): Comlink.Remote<PdfWorkerApi> {
  if (!pdfWorker) {
    const worker = new Worker(new URL("../workers/pdf.worker.ts", import.meta.url), {
      type: "module",
      name: "filesmith-pdf",
    });
    pdfWorker = Comlink.wrap<PdfWorkerApi>(worker);
  }
  return pdfWorker;
}

/** Wrap a progress callback so it can cross the worker boundary. */
export const proxy = Comlink.proxy;
