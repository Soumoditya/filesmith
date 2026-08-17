import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { inflateSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addPageNumbers,
  extractPages,
  merge,
  organise,
  pageCount,
  protect,
  listFormFields,
  overlayText,
  placeImage,
  rebuildFromPageImages,
  replacePagesWithImages,
  shrinkLossless,
  splitPages,
  unlock,
  watermark,
} from "./pdfOps";

/**
 * These run the real pdf-lib pipeline and then re-open the output to inspect
 * it, rather than trusting that "threw no exception" means "correct document".
 */

/**
 * Pages carry both a distinct width and a distinct label. Width is the
 * cheap identity check; the label proves the drawn content came along too.
 */
async function makePdf(labels: string[], baseWidth = 400) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  labels.forEach((label, i) => {
    const page = doc.addPage([baseWidth + i, 600]);
    page.drawText(label, { x: 40, y: 500, size: 40, font, color: rgb(0, 0, 0) });
  });
  return doc.save();
}

/** Page widths in document order — a fingerprint of page identity. */
async function widthsOf(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => Math.round(p.getSize().width));
}

/**
 * The decoded content stream of one page. pdf-lib stores page content as an
 * array of Flate-compressed streams, so the refs are resolved and inflated.
 */
function pageContent(doc: PDFDocument, index: number): string {
  const contents = doc.getPage(index).node.Contents() as
    | {
        lookup?: (i: number) => { getContents?: () => Uint8Array };
        size?: () => number;
        getContents?: () => Uint8Array;
      }
    | undefined;
  if (!contents) return "";

  const streams =
    typeof contents.size === "function" && typeof contents.lookup === "function"
      ? Array.from({ length: contents.size() }, (_, i) => contents.lookup!(i))
      : [contents as { getContents?: () => Uint8Array }];

  let text = "";
  for (const stream of streams) {
    const raw = stream?.getContents?.();
    if (!raw) continue;
    try {
      text += inflateSync(Buffer.from(raw)).toString("latin1");
    } catch {
      text += Buffer.from(raw).toString("latin1"); // Not compressed.
    }
  }
  return text;
}

/**
 * Every string drawn on a page, concatenated.
 *
 * pdf-lib writes text as hex strings (`<48454C4C4F> Tj`) rather than
 * literals, so both forms are decoded here.
 */
function drawnText(doc: PDFDocument, index: number): string {
  const content = pageContent(doc, index);
  let out = "";

  for (const m of content.matchAll(/<([0-9A-Fa-f\s]*)>\s*Tj/g)) {
    const hex = m[1].replace(/\s+/g, "");
    for (let i = 0; i + 1 < hex.length; i += 2) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
  }
  for (const m of content.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) {
    out += m[1].replace(/\\([()\\])/g, "$1");
  }

  return out;
}

/** Text drawn on each page, in order. */
async function labelsOf(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((_, i) => drawnText(doc, i));
}

let three: Uint8Array;
let two: Uint8Array;

beforeAll(async () => {
  three = await makePdf(["A1", "A2", "A3"]);
  two = await makePdf(["B1", "B2"], 500);
});

describe("merge", () => {
  it("concatenates in the order given", async () => {
    const out = await merge([three, two]);
    expect(await pageCount(out)).toBe(5);
    expect(await labelsOf(out)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
  });

  it("respects a reversed order", async () => {
    expect(await labelsOf(await merge([two, three]))).toEqual([
      "B1",
      "B2",
      "A1",
      "A2",
      "A3",
    ]);
  });

  it("carries page geometry across, not just content", async () => {
    // Merging must not silently normalise every page to one size.
    expect(await widthsOf(await merge([three, two]))).toEqual([
      400, 401, 402, 500, 501,
    ]);
  });

  it("reports progress once per file", async () => {
    const seen: Array<[number, number]> = [];
    await merge([three, two, three], (d, t) => seen.push([d, t]));
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("handles a single input", async () => {
    expect(await pageCount(await merge([three]))).toBe(3);
  });
});

describe("extractPages", () => {
  it("takes the requested pages", async () => {
    expect(await labelsOf(await extractPages(three, [1, 3]))).toEqual(["A1", "A3"]);
  });

  it("keeps the order the caller asked for", async () => {
    // "5, 1-2" style input must not be silently sorted.
    expect(await labelsOf(await extractPages(three, [3, 1]))).toEqual(["A3", "A1"]);
    expect(await widthsOf(await extractPages(three, [3, 1]))).toEqual([402, 400]);
  });

  it("can repeat a page", async () => {
    expect(await labelsOf(await extractPages(three, [2, 2]))).toEqual(["A2", "A2"]);
  });
});

describe("splitPages", () => {
  it("produces one document per group", async () => {
    const parts = await splitPages(three, [[1], [2, 3]]);
    expect(parts).toHaveLength(2);
    expect(await labelsOf(parts[0])).toEqual(["A1"]);
    expect(await labelsOf(parts[1])).toEqual(["A2", "A3"]);
  });

  it("reports progress per group", async () => {
    const seen: number[] = [];
    await splitPages(three, [[1], [2], [3]], (d) => seen.push(d));
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe("organise", () => {
  it("reorders pages", async () => {
    const out = await organise(three, [
      { source: 3, rotate: 0 },
      { source: 1, rotate: 0 },
    ]);
    expect(await labelsOf(out)).toEqual(["A3", "A1"]);
  });

  it("drops pages that aren't listed", async () => {
    const out = await organise(three, [{ source: 2, rotate: 0 }]);
    expect(await pageCount(out)).toBe(1);
    expect(await labelsOf(out)).toEqual(["A2"]);
  });

  it("applies rotation", async () => {
    const out = await organise(three, [
      { source: 1, rotate: 90 },
      { source: 2, rotate: 0 },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(0);
  });

  it("normalises rotation to 0-359", async () => {
    // 270 + 180 would otherwise land on 450, which some viewers reject.
    const rotated = await organise(three, [{ source: 1, rotate: 270 }]);
    const twice = await organise(rotated, [{ source: 1, rotate: 180 }]);
    const angle = (await PDFDocument.load(twice)).getPage(0).getRotation().angle;
    expect(angle).toBe(90);
  });
});

describe("addPageNumbers", () => {
  const base = {
    position: "bottom-centre" as const,
    startAt: 1,
    skipPages: [] as number[],
    fontSize: 10,
    margin: 24,
    format: "{n}",
  };

  it("leaves the page count alone", async () => {
    expect(await pageCount(await addPageNumbers(three, base))).toBe(3);
  });

  it("numbers every page in sequence", async () => {
    const doc = await PDFDocument.load(await addPageNumbers(three, base));
    expect(doc.getPages().map((_, i) => drawnText(doc, i))).toEqual([
      "A11",
      "A22",
      "A33",
    ]);
  });

  it("substitutes {n} and {total}, excluding skipped pages from the total", async () => {
    const doc = await PDFDocument.load(
      await addPageNumbers(three, { ...base, format: "{n} of {total}", skipPages: [1] }),
    );
    // Page 1 is skipped, so pages 2 and 3 become "1 of 2" and "2 of 2".
    expect(drawnText(doc, 0)).toBe("A1");
    expect(drawnText(doc, 1)).toBe("A21 of 2");
    expect(drawnText(doc, 2)).toBe("A32 of 2");
  });

  it("honours startAt", async () => {
    const doc = await PDFDocument.load(await addPageNumbers(three, { ...base, startAt: 7 }));
    expect(drawnText(doc, 0)).toContain("7");
    expect(drawnText(doc, 1)).toContain("8");
  });
});

describe("watermark", () => {
  const base = {
    text: "DRAFT",
    fontSize: 48,
    opacity: 0.2,
    angle: 45,
    colour: { r: 0.5, g: 0.5, b: 0.5 },
    tile: false,
  };

  it("preserves the page count", async () => {
    expect(await pageCount(await watermark(three, base))).toBe(3);
  });

  it("draws the text on every page without losing the original content", async () => {
    const doc = await PDFDocument.load(await watermark(three, base));
    doc.getPages().forEach((_, i) => {
      const text = drawnText(doc, i);
      expect(text).toContain("DRAFT");
      expect(text).toContain(`A${i + 1}`);
    });
  });

  it("tiling draws many more copies than a single stamp", async () => {
    const one = await PDFDocument.load(await watermark(three, base));
    const many = await PDFDocument.load(await watermark(three, { ...base, tile: true }));
    const count = (d: PDFDocument) => (drawnText(d, 0).match(/DRAFT/g) || []).length;
    expect(count(one)).toBe(1);
    expect(count(many)).toBeGreaterThan(4);
  });
});

/** A 2x2 PNG, base64. Enough for pdf-lib to embed something real. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP8z4AATAxIHAgHAB1lAQoyLYcQAAAAAElFTkSuQmCC",
  "base64",
);

describe("rebuildFromPageImages", () => {
  it("keeps each page at its original size, not the image's pixel size", async () => {
    // This is the whole point: a 2x2 pixel image rendered onto an A4 page
    // must produce an A4 page, not a 2x2 point one.
    const out = await rebuildFromPageImages(
      [
        { data: TINY_PNG.buffer.slice(TINY_PNG.byteOffset, TINY_PNG.byteOffset + TINY_PNG.byteLength) as ArrayBuffer, format: "png" },
        { data: TINY_PNG.buffer.slice(TINY_PNG.byteOffset, TINY_PNG.byteOffset + TINY_PNG.byteLength) as ArrayBuffer, format: "png" },
      ],
      [
        { width: 595, height: 842 },
        { width: 400, height: 300 },
      ],
    );

    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 400, height: 300 });
  });

  it("reports progress per page", async () => {
    const seen: number[] = [];
    const data = TINY_PNG.buffer.slice(
      TINY_PNG.byteOffset,
      TINY_PNG.byteOffset + TINY_PNG.byteLength,
    ) as ArrayBuffer;
    await rebuildFromPageImages(
      [
        { data, format: "png" },
        { data, format: "png" },
      ],
      [
        { width: 100, height: 100 },
        { width: 100, height: 100 },
      ],
      (done) => seen.push(done),
    );
    expect(seen).toEqual([1, 2]);
  });

  it("falls back to the image size when no page size is given", async () => {
    const data = TINY_PNG.buffer.slice(
      TINY_PNG.byteOffset,
      TINY_PNG.byteOffset + TINY_PNG.byteLength,
    ) as ArrayBuffer;
    const out = await rebuildFromPageImages([{ data, format: "png" }], []);
    expect((await PDFDocument.load(out)).getPage(0).getSize()).toEqual({
      width: 2,
      height: 2,
    });
  });
});

describe("shrinkLossless", () => {
  it("keeps every page and its drawn content", async () => {
    const out = await shrinkLossless(three);
    expect(await pageCount(out)).toBe(3);
    expect(await labelsOf(out)).toEqual(["A1", "A2", "A3"]);
  });

  it("strips the metadata it promises to strip", async () => {
    const doc = await PDFDocument.load(three);
    doc.setAuthor("Someone Private");
    doc.setTitle("Internal draft");
    const withMetadata = await doc.save();

    const out = await shrinkLossless(withMetadata);
    const reopened = await PDFDocument.load(out);
    expect(reopened.getAuthor() || "").toBe("");
    expect(reopened.getTitle() || "").toBe("");
  });
});

describe("replacePagesWithImages", () => {
  const png = () =>
    TINY_PNG.buffer.slice(
      TINY_PNG.byteOffset,
      TINY_PNG.byteOffset + TINY_PNG.byteLength,
    ) as ArrayBuffer;

  it("destroys the text on a replaced page, and keeps it everywhere else", async () => {
    // This is the guarantee redaction depends on. Drawing a black box over
    // text leaves it extractable underneath; replacing the page must not.
    const out = await replacePagesWithImages(three, [
      { page: 2, data: png(), format: "png" },
    ]);

    const labels = await labelsOf(out);
    expect(labels[0]).toBe("A1");
    expect(labels[1]).toBe(""); // page 2 is now a picture — no text at all
    expect(labels[2]).toBe("A3");
  });

  it("keeps the page count and each page's original size", async () => {
    const out = await replacePagesWithImages(three, [
      { page: 1, data: png(), format: "png" },
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    // Page 1 was 400 points wide in the fixture; the 2x2 image must not
    // shrink it to 2 points.
    expect(Math.round(doc.getPage(0).getSize().width)).toBe(400);
  });

  it("copies everything through untouched when nothing is replaced", async () => {
    const out = await replacePagesWithImages(three, []);
    expect(await labelsOf(out)).toEqual(["A1", "A2", "A3"]);
  });

  it("reports progress across all pages, not just replaced ones", async () => {
    const seen: number[] = [];
    await replacePagesWithImages(
      three,
      [{ page: 2, data: png(), format: "png" }],
      (done) => seen.push(done),
    );
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe("overlayText", () => {
  it("writes the new text and leaves the page count alone", async () => {
    const out = await overlayText(three, [
      {
        page: 1,
        x: 50,
        y: 400,
        width: 200,
        height: 20,
        text: "Corrected",
        fontSize: 12,
      },
    ]);
    expect(await pageCount(out)).toBe(3);
    const doc = await PDFDocument.load(out);
    expect(drawnText(doc, 0)).toContain("Corrected");
  });

  it("leaves the original text in the file, which is why it isn't redaction", async () => {
    // Stated plainly in the tool's own warning; asserted here so the
    // behaviour can't drift into looking like redaction by accident.
    const out = await overlayText(three, [
      { page: 1, x: 0, y: 0, width: 400, height: 600, text: "New", fontSize: 12 },
    ]);
    const doc = await PDFDocument.load(out);
    expect(drawnText(doc, 0)).toContain("A1");
  });

  it("can cover without writing anything", async () => {
    const out = await overlayText(three, [
      { page: 1, x: 10, y: 10, width: 50, height: 20, text: "", fontSize: 12 },
    ]);
    expect(await pageCount(out)).toBe(3);
  });

  it("ignores an edit pointing at a page that doesn't exist", async () => {
    const out = await overlayText(three, [
      { page: 99, x: 0, y: 0, width: 10, height: 10, text: "Nowhere", fontSize: 12 },
    ]);
    expect(await pageCount(out)).toBe(3);
  });
});

describe("placeImage", () => {
  it("stamps onto the pages named, and no others", async () => {
    const data = TINY_PNG.buffer.slice(
      TINY_PNG.byteOffset,
      TINY_PNG.byteOffset + TINY_PNG.byteLength,
    ) as ArrayBuffer;

    const before = (await PDFDocument.load(three)).getPage(2);
    const beforeSize = before.getSize();

    const out = await placeImage(three, { data, format: "png" }, [
      { page: 1, x: 20, y: 20, width: 80, height: 40 },
      { page: 1, x: 200, y: 20, width: 80, height: 40 },
    ]);

    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    // Original content survives; the stamp is added, not substituted.
    expect(drawnText(doc, 0)).toContain("A1");
    expect(doc.getPage(2).getSize()).toEqual(beforeSize);
  });
});

describe("form fields", () => {
  it("reports no fields for a document that has no form", async () => {
    expect(await listFormFields(three)).toEqual([]);
  });
});

describe("protect and unlock", () => {
  const opts = {
    userPassword: "open-sesame",
    allowPrinting: true,
    allowCopying: false,
  };

  it("produces a file that needs the password", async () => {
    const locked = await protect(three, opts);
    await expect(PDFDocument.load(locked)).rejects.toThrow();
    const opened = await PDFDocument.load(locked, { password: "open-sesame" });
    expect(opened.getPageCount()).toBe(3);
  });

  it("round-trips back to an openable document with content intact", async () => {
    const locked = await protect(three, opts);
    const opened = await unlock(locked, "open-sesame");
    expect(await pageCount(opened)).toBe(3);
    expect(await labelsOf(opened)).toEqual(["A1", "A2", "A3"]);
    // And the encryption really is gone, not just bypassed on load.
    expect(Buffer.from(opened).toString("latin1")).not.toContain("/Encrypt");
  });

  it("rejects the wrong password when unlocking", async () => {
    const locked = await protect(three, opts);
    await expect(unlock(locked, "wrong")).rejects.toThrow();
  });
});
