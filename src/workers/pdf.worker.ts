import { PDFDocument } from "@cantoo/pdf-lib";
import * as Comlink from "comlink";

/**
 * PDF work happens off the main thread so the UI stays responsive on big
 * documents. File objects are passed in directly rather than ArrayBuffers:
 * they're structured-cloneable by reference, so a 200MB PDF is never held
 * in main-thread memory just to hand it over.
 */

export type ProgressFn = (done: number, total: number) => void;

export interface PdfWorkerApi {
  pageCount(file: File): Promise<number>;
  merge(files: File[], onProgress: ProgressFn): Promise<Uint8Array>;
}

async function load(file: File) {
  const bytes = await file.arrayBuffer();
  // `ignoreEncryption` lets us read PDFs that carry an owner password but no
  // user password — very common for documents from banks and government sites.
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

const api: PdfWorkerApi = {
  async pageCount(file) {
    const doc = await load(file);
    return doc.getPageCount();
  },

  async merge(files, onProgress) {
    const out = await PDFDocument.create();

    for (let i = 0; i < files.length; i++) {
      const src = await load(files[i]);
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const page of pages) out.addPage(page);
      onProgress(i + 1, files.length);
    }

    out.setProducer("Filesmith");
    out.setCreator("Filesmith");

    const bytes = await out.save();
    return Comlink.transfer(bytes, [bytes.buffer as ArrayBuffer]);
  },
};

Comlink.expose(api);
