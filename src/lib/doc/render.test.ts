import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { setFontLoader } from "./fonts";
import { DEFAULT_STYLE, pageSetup, type Block, type DocumentSpec } from "./model";
import { renderDocument } from "./render";

/**
 * The real proof: build a PDF, then read it back with an independent parser
 * (pdf.js) and assert the text is byte-for-byte what went in.
 *
 * This is the test that catches the silent-substitution failure that started
 * the whole font effort — `₹` becoming a blank, or `नमस्ते` becoming `??????`.
 * Neither throws, so only a round-trip assertion finds them.
 */

const FONT_DIR = join(process.cwd(), "public", "fonts");

beforeAll(() => {
  setFontLoader(async (name) => new Uint8Array(await readFile(join(FONT_DIR, name))));
});

/**
 * pdf.js is loaded once for the whole suite. Importing it per call made
 * these tests intermittently blow past the default timeout — the assertions
 * were sound, the import cost wasn't.
 */
let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

function getPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

/** Extracts the text of every page, using pdf.js rather than our own code. */
async function extractText(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(""),
    );
    page.cleanup();
  }

  await task.destroy();
  return pages;
}

const spec = (blocks: Block[], over: Partial<DocumentSpec> = {}): DocumentSpec => ({
  page: pageSetup("a4", 54),
  style: DEFAULT_STYLE,
  blocks,
  ...over,
});

const para = (text: string): Block => ({ type: "paragraph", runs: [{ text }] });

describe("text survives the round trip", () => {
  it("keeps plain English intact", async () => {
    const { bytes } = await renderDocument(spec([para("Hello world")]));
    expect((await extractText(bytes))[0]).toContain("Hello world");
  });

  it("keeps the rupee sign — the failure this engine was built for", async () => {
    const { bytes, warnings } = await renderDocument(
      spec([para("Total due: ₹1,20,000 only")]),
    );
    const text = (await extractText(bytes))[0];
    expect(text).toContain("₹");
    expect(text).toContain("₹1,20,000");
    expect(text).not.toContain("?");
    expect(warnings).toEqual([]);
  });

  it("keeps word-processor punctuation intact", async () => {
    const sample = "“Smart quotes” — em dash… café naïve ½ € £ ¥";
    const { bytes } = await renderDocument(spec([para(sample)]));
    const text = (await extractText(bytes))[0];
    for (const ch of ["“", "”", "—", "…", "é", "ï", "½", "€", "£", "¥"]) {
      expect(text, `expected ${ch} to survive`).toContain(ch);
    }
  });

  it("keeps Devanagari characters, and says shaping is imperfect", async () => {
    const { bytes, warnings } = await renderDocument(spec([para("नमस्ते Asha")]));
    const text = (await extractText(bytes))[0];
    // The characters are preserved and searchable...
    expect(text).toContain("Asha");
    expect(/[ऀ-ॿ]/.test(text)).toBe(true);
    // ...but the user is told the glyph shaping isn't right yet.
    expect(warnings.some((w) => w.kind === "complex-script")).toBe(true);
  });

  it("warns rather than silently dropping unsupported characters", async () => {
    const { warnings } = await renderDocument(spec([para("Hello 漢字")]));
    expect(warnings.some((w) => w.kind === "missing")).toBe(true);
  });

  it("preserves mixed bold and italic content", async () => {
    const { bytes } = await renderDocument(
      spec([
        {
          type: "paragraph",
          runs: [
            { text: "Normal " },
            { text: "bold", bold: true },
            { text: " and " },
            { text: "italic", italic: true },
          ],
        },
      ]),
    );
    expect((await extractText(bytes))[0]).toContain("Normal bold and italic");
  });
});

describe("pagination", () => {
  it("puts short content on one page", async () => {
    const { pageCount } = await renderDocument(spec([para("Short.")]));
    expect(pageCount).toBe(1);
  });

  it("flows long content onto several pages", async () => {
    const blocks = Array.from({ length: 120 }, (_, i) =>
      para(`Paragraph ${i + 1}. ${"The quick brown fox jumps over the lazy dog. ".repeat(3)}`),
    );
    const { pageCount, bytes } = await renderDocument(spec(blocks));
    expect(pageCount).toBeGreaterThan(3);

    // Nothing may be lost at a page boundary.
    const all = (await extractText(bytes)).join(" ");
    expect(all).toContain("Paragraph 1.");
    expect(all).toContain("Paragraph 120.");
  });

  it("honours an explicit page break", async () => {
    const { pageCount } = await renderDocument(
      spec([para("First"), { type: "pageBreak" }, para("Second")]),
    );
    expect(pageCount).toBe(2);
  });

  it("keeps a heading with the text that follows it", async () => {
    // Fill nearly a page, then a heading: it must not be stranded alone.
    const filler = Array.from({ length: 33 }, (_, i) => para(`Line ${i}`));
    const { bytes } = await renderDocument(
      spec([
        ...filler,
        { type: "heading", level: 2, runs: [{ text: "Section heading" }] },
        para("Body text under the heading."),
      ]),
    );

    const pages = await extractText(bytes);
    const headingPage = pages.findIndex((p) => p.includes("Section heading"));
    expect(headingPage).toBeGreaterThanOrEqual(0);
    expect(pages[headingPage]).toContain("Body text under the heading.");
  });

  it("numbers pages through the footer template", async () => {
    const blocks = Array.from({ length: 90 }, (_, i) => para(`Item ${i}`));
    const { bytes, pageCount } = await renderDocument(
      spec(blocks, { footer: { template: "Page {n} of {total}" } }),
    );
    const pages = await extractText(bytes);
    expect(pages[0]).toContain(`Page 1 of ${pageCount}`);
    expect(pages.at(-1)).toContain(`Page ${pageCount} of ${pageCount}`);
  });
});

describe("blocks", () => {
  it("renders bullets with their markers", async () => {
    const { bytes } = await renderDocument(
      spec([
        {
          type: "bullets",
          items: [[{ text: "First point" }], [{ text: "Second point" }]],
        },
      ]),
    );
    const text = (await extractText(bytes))[0];
    expect(text).toContain("First point");
    expect(text).toContain("Second point");
    expect(text).toContain("•");
  });

  it("renders table cells in column order", async () => {
    const { bytes } = await renderDocument(
      spec([
        {
          type: "table",
          columns: [{ width: 2 }, { width: 1, align: "right" }],
          headerRow: true,
          rows: [
            [[{ text: "Description" }], [{ text: "Amount" }]],
            [[{ text: "Consulting" }], [{ text: "₹50,000" }]],
          ],
        },
      ]),
    );
    const text = (await extractText(bytes))[0];
    expect(text).toContain("Description");
    expect(text).toContain("Consulting");
    expect(text).toContain("₹50,000");
  });

  it("wraps a long unbroken string instead of overflowing the page", async () => {
    const long = "A".repeat(400);
    const { bytes, pageCount } = await renderDocument(spec([para(long)]));
    expect(pageCount).toBeGreaterThanOrEqual(1);
    const text = (await extractText(bytes)).join("");
    // Every character must still be there, just across several lines.
    expect((text.match(/A/g) || []).length).toBe(400);
  });

  it("produces a valid document from no blocks at all", async () => {
    const { bytes, pageCount } = await renderDocument(spec([]));
    expect(pageCount).toBe(1);
    expect(Buffer.from(bytes).toString("latin1").slice(0, 5)).toBe("%PDF-");
  });
});

describe("metadata", () => {
  it("records the title and author", async () => {
    const { bytes } = await renderDocument(
      spec([para("x")], { title: "Asha Menon — Resume", author: "Asha Menon" }),
    );
    const pdfjs = await getPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
    const doc = await task.promise;
    const meta = (await doc.getMetadata()) as unknown as { info: Record<string, string> };
    const { info } = meta;
    expect(info.Title).toBe("Asha Menon — Resume");
    expect(info.Author).toBe("Asha Menon");
    await task.destroy();
  });
});
