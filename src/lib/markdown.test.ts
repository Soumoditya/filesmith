import { describe, expect, it } from "vitest";
import { markdownToBlocks, parseInline, textStats } from "./markdown";
import type { Block } from "./doc/model";

/** Narrows a block list to one kind, for readable assertions. */
const only = <K extends Block["type"]>(blocks: Block[], kind: K) =>
  blocks.filter((b): b is Extract<Block, { type: K }> => b.type === kind);

describe("parseInline", () => {
  it("reads bold, italic and both", () => {
    expect(parseInline("**bold**")).toEqual([{ text: "bold", bold: true }]);
    expect(parseInline("*italic*")).toEqual([{ text: "italic", italic: true }]);
    expect(parseInline("***both***")).toEqual([
      { text: "both", bold: true, italic: true },
    ]);
  });

  it("reads bold before italic, so ** isn't two italics", () => {
    const runs = parseInline("a **strong** b");
    expect(runs).toHaveLength(3);
    expect(runs[1]).toEqual({ text: "strong", bold: true });
  });

  it("keeps the surrounding text", () => {
    expect(parseInline("before **middle** after")).toEqual([
      { text: "before " },
      { text: "middle", bold: true },
      { text: " after" },
    ]);
  });

  it("reads links, keeping the label and the target", () => {
    expect(parseInline("see [the docs](https://example.com)")).toEqual([
      { text: "see " },
      { text: "the docs", href: "https://example.com" },
    ]);
  });

  it("handles underscores as well as asterisks", () => {
    expect(parseInline("__bold__")).toEqual([{ text: "bold", bold: true }]);
    expect(parseInline("_italic_")).toEqual([{ text: "italic", italic: true }]);
  });

  it("leaves plain text alone", () => {
    expect(parseInline("nothing special here")).toEqual([
      { text: "nothing special here" },
    ]);
  });

  it("returns something for an empty line rather than nothing", () => {
    expect(parseInline("")).toEqual([{ text: "" }]);
  });
});

describe("markdownToBlocks", () => {
  it("reads headings at the right levels, capping at three", () => {
    const headings = only(markdownToBlocks("# One\n\n## Two\n\n##### Five"), "heading");
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3]);
    expect(headings[0].runs[0].text).toBe("One");
  });

  it("joins wrapped lines into one paragraph", () => {
    const paragraphs = only(
      markdownToBlocks("This sentence\nwraps across lines."),
      "paragraph",
    );
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].runs.map((r) => r.text).join("")).toBe(
      "This sentence wraps across lines.",
    );
  });

  it("splits paragraphs on a blank line", () => {
    expect(only(markdownToBlocks("First.\n\nSecond."), "paragraph")).toHaveLength(2);
  });

  it("keeps line breaks when asked to", () => {
    const [paragraph] = only(
      markdownToBlocks("Line one\nLine two", { preserveLineBreaks: true }),
      "paragraph",
    );
    expect(paragraph.runs.map((r) => r.text).join("")).toContain("\n");
  });

  it("reads bulleted lists", () => {
    const [list] = only(markdownToBlocks("- One\n- Two\n- Three"), "bullets");
    expect(list.items).toHaveLength(3);
    expect(list.items[0][0].text).toBe("One");
  });

  it("numbers ordered lists, continuing from where they start", () => {
    const [list] = only(markdownToBlocks("3. Third\n4. Fourth"), "bullets");
    expect(list.items[0][0].text).toBe("3. ");
    expect(list.items[1][0].text).toBe("4. ");
  });

  it("keeps bulleted and numbered lists separate", () => {
    const lists = only(markdownToBlocks("- a\n- b\n\n1. one\n2. two"), "bullets");
    expect(lists).toHaveLength(2);
  });

  it("reads tables with a header row", () => {
    const [table] = only(
      markdownToBlocks("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |"),
      "table",
    );
    expect(table.headerRow).toBe(true);
    expect(table.columns).toHaveLength(2);
    expect(table.rows).toHaveLength(3);
    expect(table.rows[1][0][0].text).toBe("1");
  });

  it("treats a pipe line without a separator as ordinary text", () => {
    // Otherwise a sentence containing | becomes a broken table.
    expect(only(markdownToBlocks("| not a table"), "table")).toHaveLength(0);
  });

  it("reads horizontal rules", () => {
    expect(only(markdownToBlocks("above\n\n---\n\nbelow"), "rule")).toHaveLength(1);
  });

  it("reads block quotes as indented italics", () => {
    const [quote] = only(markdownToBlocks("> Quoted line"), "paragraph");
    expect(quote.indent).toBeGreaterThan(0);
    expect(quote.runs[0].italic).toBe(true);
  });

  it("keeps fenced code verbatim, markup and all", () => {
    const blocks = markdownToBlocks("```\nconst x = **not bold**;\n```");
    const [code] = only(blocks, "paragraph");
    expect(code.runs[0].text).toContain("**not bold**");
  });

  it("starts a new page before each top-level heading when asked", () => {
    const blocks = markdownToBlocks("# One\n\ntext\n\n# Two", {
      pageBreakOnHeading: true,
    });
    expect(only(blocks, "pageBreak")).toHaveLength(1);
    // Never before the very first heading, which would open on a blank page.
    expect(blocks[0].type).toBe("heading");
  });

  it("handles an empty document", () => {
    expect(markdownToBlocks("")).toEqual([]);
    expect(markdownToBlocks("   \n\n  ")).toEqual([]);
  });

  it("copes with Windows line endings", () => {
    expect(only(markdownToBlocks("# Title\r\n\r\nBody."), "heading")).toHaveLength(1);
  });

  it("reads the bundled sample without losing its parts", () => {
    const blocks = markdownToBlocks(
      "# Notes\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> quoted\n\n---\n\nEnd.",
    );
    expect(only(blocks, "heading")).toHaveLength(1);
    expect(only(blocks, "bullets")).toHaveLength(1);
    expect(only(blocks, "table")).toHaveLength(1);
    expect(only(blocks, "rule")).toHaveLength(1);
  });
});

describe("textStats", () => {
  it("counts words, characters and paragraphs", () => {
    const stats = textStats("One two three.\n\nFour five.");
    expect(stats.words).toBe(5);
    expect(stats.paragraphs).toBe(2);
    expect(stats.charactersNoSpaces).toBeLessThan(stats.characters);
  });

  it("reports at least a minute of reading", () => {
    expect(textStats("hi").readingMinutes).toBe(1);
  });

  it("scales reading time with length", () => {
    const long = textStats("word ".repeat(1000));
    expect(long.readingMinutes).toBeGreaterThan(3);
  });

  it("counts nothing in an empty document", () => {
    expect(textStats("").words).toBe(0);
    expect(textStats("   ").words).toBe(0);
  });
});
