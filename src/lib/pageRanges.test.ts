import { describe, expect, it } from "vitest";
import { consecutiveRuns, formatPageRanges, parsePageRanges } from "./pageRanges";

const parse = (input: string, total = 10) => parsePageRanges(input, total);

describe("parsePageRanges", () => {
  it("reads single pages and ranges", () => {
    expect(parse("3").pages).toEqual([3]);
    expect(parse("2-5").pages).toEqual([2, 3, 4, 5]);
    expect(parse("1-2, 7, 9-10").pages).toEqual([1, 2, 7, 9, 10]);
  });

  it("accepts spaces instead of commas", () => {
    expect(parse("1 3 5").pages).toEqual([1, 3, 5]);
    expect(parse("  2 - 4  ").pages).toEqual([2, 3, 4]);
  });

  it("treats an open-ended range as running to the last page", () => {
    expect(parse("8-").pages).toEqual([8, 9, 10]);
  });

  it("understands 'all'", () => {
    expect(parse("all", 3).pages).toEqual([1, 2, 3]);
    expect(parse("ALL", 3).pages).toEqual([1, 2, 3]);
  });

  it("preserves the order the user typed", () => {
    // Someone extracting "5, 1-2" wants page 5 first.
    expect(parse("5, 1-2").pages).toEqual([5, 1, 2]);
  });

  it("drops duplicates, keeping the first mention", () => {
    expect(parse("3, 1-4, 3").pages).toEqual([3, 1, 2, 4]);
  });

  it("accepts a backwards range", () => {
    expect(parse("6-3").pages).toEqual([3, 4, 5, 6]);
  });

  it("accepts en and em dashes from autocorrect", () => {
    expect(parse("2–4").pages).toEqual([2, 3, 4]);
    expect(parse("2—4").pages).toEqual([2, 3, 4]);
  });

  it("silently clips pages past the end", () => {
    expect(parse("8-15").pages).toEqual([8, 9, 10]);
  });

  it("explains when nothing at all is in range", () => {
    const r = parse("20-30");
    expect(r.pages).toEqual([]);
    expect(r.error).toContain("only has 10 pages");
  });

  it("rejects page zero", () => {
    expect(parse("0").error).toContain("start at 1");
    expect(parse("0-3").error).toContain("start at 1");
  });

  it("explains unparseable input", () => {
    const r = parse("1, banana");
    expect(r.pages).toEqual([]);
    expect(r.error).toContain("banana");
  });

  it("returns nothing for empty input, without complaining", () => {
    expect(parse("")).toEqual({ pages: [], error: null });
    expect(parse("   ")).toEqual({ pages: [], error: null });
  });

  it("handles a single-page document", () => {
    expect(parse("all", 1).pages).toEqual([1]);
    expect(parse("1-", 1).pages).toEqual([1]);
  });
});

describe("formatPageRanges", () => {
  it("collapses runs", () => {
    expect(formatPageRanges([1, 2, 3, 7, 9, 10])).toBe("1-3, 7, 9-10");
  });

  it("sorts and dedupes first", () => {
    expect(formatPageRanges([5, 1, 3, 2, 5])).toBe("1-3, 5");
  });

  it("handles the empty case and a lone page", () => {
    expect(formatPageRanges([])).toBe("");
    expect(formatPageRanges([4])).toBe("4");
  });

  it("round-trips through the parser", () => {
    const pages = [1, 2, 3, 7, 9, 10];
    expect(parsePageRanges(formatPageRanges(pages), 10).pages).toEqual(pages);
  });
});

describe("consecutiveRuns", () => {
  it("groups consecutive pages", () => {
    expect(consecutiveRuns([1, 2, 3, 7, 9, 10])).toEqual([[1, 2, 3], [7], [9, 10]]);
  });

  it("sorts before grouping", () => {
    expect(consecutiveRuns([3, 1, 2])).toEqual([[1, 2, 3]]);
  });

  it("handles empty input", () => {
    expect(consecutiveRuns([])).toEqual([]);
  });
});
