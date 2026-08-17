import type { PDFDocument } from "@cantoo/pdf-lib";
import { basename } from "./paths";
import {
  filesFor,
  type FontFamily,
  type FontStyle,
  type FontWeight,
} from "./fontCatalogue";
import { FontStack, type FontFace } from "./fontStack";

/**
 * Loads font files and embeds them into a PDF as a fallback stack.
 *
 * Faces are fetched from /fonts/ on demand rather than bundled, so opening a
 * document tool doesn't download 780KB of typefaces the user may never need.
 * Raw bytes are cached for the session; embedded fonts are cached per
 * document, since a PDFFont belongs to the document that embedded it.
 */

export type FontBytesLoader = (fileName: string) => Promise<Uint8Array>;

const defaultLoader: FontBytesLoader = async (fileName) => {
  const res = await fetch(`/fonts/${fileName}`);
  if (!res.ok) throw new Error(`Couldn't load the font ${fileName}.`);
  return new Uint8Array(await res.arrayBuffer());
};

let loadBytes: FontBytesLoader = defaultLoader;

/** Swapped out by the Node tests, which read from node_modules directly. */
export function setFontLoader(loader: FontBytesLoader): void {
  loadBytes = loader;
}

const byteCache = new Map<string, Promise<Uint8Array>>();

function fetchFont(fileName: string): Promise<Uint8Array> {
  let cached = byteCache.get(fileName);
  if (!cached) {
    cached = loadBytes(fileName).catch((err) => {
      // A failed fetch must not poison the cache, or a transient network
      // blip would break fonts for the rest of the session.
      byteCache.delete(fileName);
      throw err;
    });
    byteCache.set(fileName, cached);
  }
  return cached;
}

/** fontkit is ~400KB, so it only loads when a document is actually built. */
let fontkitPromise: Promise<unknown> | null = null;

async function getFontkit(): Promise<unknown> {
  fontkitPromise ??= import("fontkit").then((m) => m.default ?? m);
  return fontkitPromise;
}

const registered = new WeakSet<PDFDocument>();
const stackCache = new WeakMap<PDFDocument, Map<string, FontStack>>();

/**
 * Builds (or returns a cached) font stack for one family/weight/style on a
 * document. Faces that fail to load are skipped rather than fatal — a
 * missing italic in one subset shouldn't lose the whole document.
 */
export async function buildFontStack(
  doc: PDFDocument,
  family: FontFamily,
  weight: FontWeight,
  style: FontStyle,
): Promise<FontStack> {
  const key = `${family}-${weight}-${style}`;

  let perDoc = stackCache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    stackCache.set(doc, perDoc);
  }
  const hit = perDoc.get(key);
  if (hit) return hit;

  if (!registered.has(doc)) {
    doc.registerFontkit((await getFontkit()) as Parameters<PDFDocument["registerFontkit"]>[0]);
    registered.add(doc);
  }

  const files = filesFor(family, weight, style);
  const faces: FontFace[] = [];
  const failures: string[] = [];

  for (const file of files) {
    const name = basename(file);
    try {
      const bytes = await fetchFont(name);
      // Subsetting keeps the output small: only the glyphs actually drawn
      // are written into the PDF.
      const pdfFont = await doc.embedFont(bytes, { subset: true });

      // pdf-lib keeps the parsed fontkit font on the embedder, which is the
      // only way to ask "do you have a glyph for this code point?".
      const embedder = (pdfFont as unknown as { embedder?: { font?: unknown } }).embedder;
      const parsed = embedder?.font as
        | { hasGlyphForCodePoint?: (cp: number) => boolean }
        | undefined;

      const covers =
        typeof parsed?.hasGlyphForCodePoint === "function"
          ? (cp: number) => parsed.hasGlyphForCodePoint!(cp)
          : // Without coverage data, claim only ASCII so the fallback chain
            // still has a chance to find a better face.
            (cp: number) => cp < 0x80;

      faces.push({ pdfFont, covers, name });
    } catch {
      failures.push(name);
    }
  }

  if (faces.length === 0) {
    throw new Error(
      `None of the font files for ${family} ${weight} ${style} could be loaded. ` +
        `Tried: ${failures.join(", ")}`,
    );
  }

  const stack = new FontStack(faces);
  perDoc.set(key, stack);
  return stack;
}

/** Loads every face a document might use, so layout never awaits mid-flow. */
export async function preloadFonts(
  doc: PDFDocument,
  family: FontFamily,
): Promise<Record<string, FontStack>> {
  const combos: Array<[FontWeight, FontStyle]> = [
    [400, "normal"],
    [400, "italic"],
    [700, "normal"],
    [700, "italic"],
  ];

  const entries = await Promise.all(
    combos.map(async ([weight, style]) => {
      const stack = await buildFontStack(doc, family, weight, style);
      return [`${weight}-${style}`, stack] as const;
    }),
  );

  return Object.fromEntries(entries);
}
