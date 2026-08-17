import * as Comlink from "comlink";
import * as ops from "../lib/pdfOps";

/**
 * A thin Comlink shim over `lib/pdfOps`, so PDF writing happens off the main
 * thread. All the actual logic lives in pdfOps, where it can be tested.
 *
 * File objects cross the boundary directly rather than as ArrayBuffers:
 * they're structured-cloneable by reference, so a 200MB PDF is never copied
 * into main-thread memory just to hand it over.
 */

/** Hands ownership of the bytes back instead of copying them. */
function send(bytes: Uint8Array): Uint8Array {
  return Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer]);
}

function sendAll(list: Uint8Array[]): Uint8Array[] {
  return Comlink.transfer(
    list,
    list.map((b) => b.buffer as ArrayBuffer),
  );
}

const api = {
  pageCount: (file: File) => ops.pageCount(file),

  merge: async (files: File[], onProgress: ops.ProgressFn) =>
    send(await ops.merge(files, onProgress)),

  extractPages: async (file: File, pages: number[]) =>
    send(await ops.extractPages(file, pages)),

  splitPages: async (file: File, groups: number[][], onProgress: ops.ProgressFn) =>
    sendAll(await ops.splitPages(file, groups, onProgress)),

  organise: async (file: File, pageOps: ops.PageOp[]) =>
    send(await ops.organise(file, pageOps)),

  imagesToPdf: async (
    files: File[],
    opts: ops.ImagesToPdfOptions,
    onProgress: ops.ProgressFn,
  ) => send(await ops.imagesToPdf(files, opts, onProgress)),

  rebuildFromPageImages: async (
    images: Array<{ data: ArrayBuffer; format: "png" | "jpg" }>,
    sizes: Array<{ width: number; height: number }>,
    onProgress: ops.ProgressFn,
  ) => send(await ops.rebuildFromPageImages(images, sizes, onProgress)),

  shrinkLossless: async (file: File) => send(await ops.shrinkLossless(file)),

  addPageNumbers: async (file: File, opts: ops.PageNumberOptions) =>
    send(await ops.addPageNumbers(file, opts)),

  watermark: async (file: File, opts: ops.WatermarkOptions) =>
    send(await ops.watermark(file, opts)),

  protect: async (file: File, opts: ops.ProtectOptions) =>
    send(await ops.protect(file, opts)),

  unlock: async (file: File, password: string) =>
    send(await ops.unlock(file, password)),
};

export type PdfWorkerApi = typeof api;

Comlink.expose(api);
