import { describe, expect, it } from "vitest";
import { itemsToParagraphs, type PositionedItem } from "./wordConvert";

/**
 * A PDF has no paragraphs — only glyphs at coordinates — so structure is
 * inferred from geometry. These fix the inference rules, because the failure
 * mode is silent: a converted document that reads as one enormous paragraph
 * still "works", it's just useless.
 */

/** Builds a line of positioned items at a given baseline. */
const line = (
  text: string,
  y: number,
  { x = 72, size = 11, bold = false } = {},
): PositionedItem => ({ text, x, y, height: size, bold });

describe("itemsToParagraphs", () => {
  it("joins lines of one paragraph back together", () => {
    const paragraphs = itemsToParagraphs([
      line("The quick brown fox", 700),
      line("jumps over the lazy dog.", 686),
    ]);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text).toBe("The quick brown fox jumps over the lazy dog.");
  });

  it("splits paragraphs at a wide vertical gap", () => {
    const paragraphs = itemsToParagraphs([
      line("First paragraph.", 700),
      line("Still the first.", 686),
      // A gap much bigger than a line means a new paragraph.
      line("Second paragraph.", 640),
    ]);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].text).toBe("First paragraph. Still the first.");
    expect(paragraphs[1].text).toBe("Second paragraph.");
  });

  it("orders text top to bottom, then left to right", () => {
    // Deliberately supplied out of order, as pdf.js often does.
    const paragraphs = itemsToParagraphs([
      line("world", 700, { x: 140 }),
      line("Hello", 700, { x: 72 }),
      line("Second line.", 660),
    ]);
    expect(paragraphs[0].text).toBe("Hello world");
    expect(paragraphs[1].text).toBe("Second line.");
  });

  it("treats noticeably larger text as a heading", () => {
    const paragraphs = itemsToParagraphs([
      line("Chapter One", 740, { size: 22 }),
      line("Body text here.", 700),
      line("More body text.", 686),
      line("Another body line.", 672),
    ]);
    expect(paragraphs[0].heading).toBe(1);
    expect(paragraphs[0].text).toBe("Chapter One");
    expect(paragraphs[1].heading).toBe(0);
  });

  it("works out the body size from what's most common, not the first line", () => {
    // One big line shouldn't make the whole document look like headings.
    const items = [line("Title", 740, { size: 20 })];
    for (let i = 0; i < 8; i++) items.push(line(`Body line ${i}`, 700 - i * 14));

    const paragraphs = itemsToParagraphs(items);
    expect(paragraphs[0].heading).toBeGreaterThan(0);
    expect(paragraphs.slice(1).every((p) => p.heading === 0)).toBe(true);
  });

  it("recognises bullets and strips the marker", () => {
    const paragraphs = itemsToParagraphs([
      line("• First point", 700),
      line("• Second point", 680),
    ]);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].bullet).toBe(true);
    expect(paragraphs[0].text).toBe("First point");
    expect(paragraphs[1].text).toBe("Second point");
  });

  it("recognises the several characters used as bullets", () => {
    for (const marker of ["•", "·", "▪", "-", "–", "*"]) {
      const [paragraph] = itemsToParagraphs([line(`${marker} An item`, 700)]);
      expect(paragraph.bullet, `expected "${marker}" to read as a bullet`).toBe(true);
      expect(paragraph.text).toBe("An item");
    }
  });

  it("groups items sharing a baseline despite slight drift", () => {
    // Real PDFs place glyphs a fraction of a point apart on the same line.
    const paragraphs = itemsToParagraphs([
      line("Hello ", 700.0, { x: 72 }),
      line("there", 700.4, { x: 110 }),
    ]);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text).toBe("Hello there");
  });

  it("ignores whitespace-only items", () => {
    expect(itemsToParagraphs([line("   ", 700), line("\n", 690)])).toEqual([]);
  });

  it("returns nothing for an empty page rather than throwing", () => {
    expect(itemsToParagraphs([])).toEqual([]);
  });

  it("starts a new block when a heading follows body text", () => {
    const paragraphs = itemsToParagraphs([
      line("Body text.", 700),
      line("A Heading", 682, { size: 18 }),
      line("More body.", 664),
    ]);
    expect(paragraphs.map((p) => p.heading)).toEqual([0, 1, 0]);
  });
});
