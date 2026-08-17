import { createCanvas } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { setFontLoader } from "./doc/fonts";
import { DEFAULT_STYLE, pageSetup, type Block } from "./doc/model";
import { renderDocument } from "./doc/render";
import { dpiToScale } from "./raster";

/**
 * Rasterisation runs in the browser because it needs a canvas, so these tests
 * supply one. That lets the DPI maths and the actual page rendering be checked
 * here rather than only by hand in a browser — which matters, because getting
 * the scale wrong produces output that looks fine but prints at the wrong size.
 */

const FONT_DIR = join(process.cwd(), "public", "fonts");

beforeAll(() => {
  setFontLoader(async (name) => new Uint8Array(await readFile(join(FONT_DIR, name))));
});

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
const getPdfjs = () => (pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs"));

/** Builds a real multi-page PDF with embedded fonts, as the app produces. */
async function makePdf(pages: number): Promise<Uint8Array> {
  const blocks: Block[] = [];
  for (let p = 0; p < pages; p++) {
    blocks.push({ type: "heading", level: 1, runs: [{ text: `Page ${p + 1}` }] });
    blocks.push({
      type: "paragraph",
      runs: [{ text: `Total ₹12,500. ${"body text ".repeat(20)}` }],
    });
    if (p < pages - 1) blocks.push({ type: "pageBreak" });
  }
  const { bytes } = await renderDocument({
    page: pageSetup("a4", 54),
    style: DEFAULT_STYLE,
    blocks,
  });
  return bytes;
}

/** The browser-side render, reproduced against a Node canvas. */
async function renderPage(pdf: Uint8Array, pageNumber: number, dpi: number) {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
  const doc = await task.promise;
  const page = await doc.getPage(pageNumber);

  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: dpiToScale(dpi) });

  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
    canvas: canvas as unknown as HTMLCanvasElement,
  }).promise;

  const png = canvas.toBuffer("image/png");
  const jpeg = canvas.toBuffer("image/jpeg", 80);

  // Count non-white pixels: proves something was actually drawn.
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] < 200) ink++;

  await task.destroy();

  return {
    width: canvas.width,
    height: canvas.height,
    pointWidth: base.width,
    pointHeight: base.height,
    png,
    jpeg,
    ink,
  };
}

describe("dpiToScale", () => {
  it("maps DPI onto PDF's 72-points-per-inch space", () => {
    expect(dpiToScale(72)).toBe(1);
    expect(dpiToScale(144)).toBe(2);
    expect(dpiToScale(300)).toBeCloseTo(4.1667, 3);
  });
});

describe("rendering a page", () => {
  it("produces an A4 page at the size the DPI asks for", async () => {
    const pdf = await makePdf(1);
    const result = await renderPage(pdf, 1, 150);

    // A4 is 595.28 x 841.89 points; at 150 DPI that's ~1240 x 1754 pixels.
    expect(result.pointWidth).toBeCloseTo(595.28, 1);
    expect(result.width).toBe(Math.round(595.28 * (150 / 72)));
    expect(result.height).toBe(Math.round(841.89 * (150 / 72)));
  });

  it("scales with DPI, so 300 is twice 150", async () => {
    const pdf = await makePdf(1);
    const low = await renderPage(pdf, 1, 150);
    const high = await renderPage(pdf, 1, 300);
    expect(high.width).toBeCloseTo(low.width * 2, -1);
  });

  it("actually draws the content rather than a blank page", async () => {
    const pdf = await makePdf(1);
    const result = await renderPage(pdf, 1, 150);
    // A page of text on A4 should mark a meaningful number of pixels.
    expect(result.ink).toBeGreaterThan(2000);
  });

  it("renders each page differently", async () => {
    const pdf = await makePdf(3);
    const first = await renderPage(pdf, 1, 100);
    const second = await renderPage(pdf, 2, 100);
    // Same geometry, different content.
    expect(first.width).toBe(second.width);
    expect(Buffer.compare(first.png, second.png)).not.toBe(0);
  });

  it("emits valid PNG and JPEG", async () => {
    const pdf = await makePdf(1);
    const { png, jpeg } = await renderPage(pdf, 1, 100);

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    // JPEG at 80% should be substantially smaller than lossless PNG.
    expect(jpeg.length).toBeLessThan(png.length);
  });

  it("keeps the point size so a rebuilt PDF matches the original", async () => {
    // The compress path renders at high DPI but must rebuild pages at their
    // original point size, or the output prints at the wrong scale.
    const pdf = await makePdf(1);
    const result = await renderPage(pdf, 1, 300);
    expect(result.width).toBeGreaterThan(result.pointWidth * 4);
    expect(result.pointWidth).toBeCloseTo(595.28, 1);
    expect(result.pointHeight).toBeCloseTo(841.89, 1);
  });
});

describe("text extraction", () => {
  it("reads back the text, page by page", async () => {
    const pdf = await makePdf(3);
    const pdfjs = await getPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
    const doc = await task.promise;

    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(""));
      page.cleanup();
    }
    await task.destroy();

    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("Page 1");
    expect(pages[2]).toContain("Page 3");
    // The rupee sign must survive extraction as well as rendering.
    expect(pages.join("").replace(/\s+/g, "")).toContain("₹12,500");
  });
});
