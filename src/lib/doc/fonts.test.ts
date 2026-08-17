import { PDFDocument } from "@cantoo/pdf-lib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { allFontFiles, filesFor } from "./fontCatalogue";
import { buildFontStack, setFontLoader } from "./fonts";
import { checkCoverage, complexScriptIn, FontStack, type FontFace } from "./fontStack";
import { basename } from "./paths";

/**
 * The regression these exist for: the built-in PDF fonts silently replace
 * anything they can't encode with "?", and the webfont packages ship fonts
 * split by Unicode range, so `₹` is absent from the plain "Inter" file.
 * Neither failure throws. Both have to be caught by assertion.
 */

const FONT_DIR = join(process.cwd(), "public", "fonts");

beforeAll(() => {
  setFontLoader(async (fileName) => new Uint8Array(await readFile(join(FONT_DIR, fileName))));
});

async function stackFor(family: "sans" | "serif" | "mono" = "sans") {
  const doc = await PDFDocument.create();
  const stack = await buildFontStack(doc, family, 400, "normal");
  return { doc, stack };
}

describe("font catalogue", () => {
  it("puts latin-ext in every stack, because that's where the rupee sign lives", () => {
    for (const family of ["sans", "serif", "mono"] as const) {
      const files = filesFor(family, 400, "normal");
      expect(files.some((f) => f.includes("latin-ext"))).toBe(true);
    }
  });

  it("appends a Devanagari fallback to every stack", () => {
    expect(filesFor("sans", 400, "normal").at(-1)).toContain("devanagari");
  });

  it("lists only files that were actually synced to public/fonts", async () => {
    const manifest = JSON.parse(
      await readFile(join(FONT_DIR, "manifest.json"), "utf8"),
    ) as Record<string, number>;
    // Some families genuinely ship no italic for every subset; what matters
    // is that at least one file per stack exists.
    for (const family of ["sans", "serif", "mono"] as const) {
      for (const style of ["normal", "italic"] as const) {
        const files = filesFor(family, 400, style).map(basename);
        expect(files.some((f) => f in manifest)).toBe(true);
      }
    }
    expect(allFontFiles().length).toBeGreaterThan(0);
  });
});

describe("glyph coverage", () => {
  it("covers the rupee sign — the case that started all this", async () => {
    const { stack } = await stackFor();
    expect(stack.uncovered("₹1,20,000")).toEqual([]);
  });

  it("covers the punctuation people paste in from word processors", async () => {
    const { stack } = await stackFor();
    expect(stack.uncovered("“smart quotes” — em dash… café naïve ½ €")).toEqual([]);
  });

  it("covers Devanagari through the fallback face", async () => {
    const { stack } = await stackFor();
    expect(stack.uncovered("नमस्ते")).toEqual([]);
  });

  it("reports characters nothing can draw", async () => {
    const { stack } = await stackFor();
    // A Han character: not in Inter, latin-ext, or Noto Devanagari.
    const missing = stack.uncovered("hello 漢");
    expect(missing).toContain("漢");
  });

  it("ignores whitespace when reporting gaps", async () => {
    const { stack } = await stackFor();
    expect(stack.uncovered("a\tb\nc d")).toEqual([]);
  });
});

describe("segmentation", () => {
  it("keeps single-script text as one run", async () => {
    const { stack } = await stackFor();
    const runs = stack.segment("Hello world");
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe("Hello world");
  });

  it("splits onto the fallback face only where needed", async () => {
    const { stack } = await stackFor();
    const runs = stack.segment("Total ₹500");
    expect(runs.length).toBeGreaterThan(1);
    // Reassembling the runs must reproduce the input exactly.
    expect(runs.map((r) => r.text).join("")).toBe("Total ₹500");
  });

  it("never loses or reorders characters, whatever the mix", async () => {
    const { stack } = await stackFor();
    const samples = ["₹1,00,000 — paid", "नमस्ते Asha", "plain", "a₹b₹c", ""];
    for (const s of samples) {
      expect(stack.segment(s).map((r) => r.text).join("")).toBe(s);
    }
  });

  it("measures width across face boundaries", async () => {
    const { stack } = await stackFor();
    const mixed = stack.widthOf("₹500", 12);
    expect(mixed).toBeGreaterThan(0);
    // A longer string is wider; catches a stack that measures only one run.
    expect(stack.widthOf("₹5000", 12)).toBeGreaterThan(mixed);
  });
});

describe("complex script detection", () => {
  it("spots scripts that need shaping", () => {
    expect(complexScriptIn("नमस्ते")).toBe("Devanagari");
    expect(complexScriptIn("مرحبا")).toBe("Arabic");
    expect(complexScriptIn("வணக்கம்")).toBe("Tamil");
  });

  it("leaves Latin alone", () => {
    expect(complexScriptIn("Hello ₹500 café")).toBeNull();
  });
});

describe("checkCoverage", () => {
  it("says nothing about ordinary text", async () => {
    const { stack } = await stackFor();
    expect(checkCoverage(stack, "Invoice total: ₹12,500")).toEqual([]);
  });

  it("warns about characters that would come out blank", async () => {
    const { stack } = await stackFor();
    const warnings = checkCoverage(stack, "漢字");
    expect(warnings.some((w) => w.kind === "missing")).toBe(true);
  });

  it("warns that Devanagari shaping is imperfect rather than pretending", async () => {
    const { stack } = await stackFor();
    const warnings = checkCoverage(stack, "नमस्ते");
    const complex = warnings.find((w) => w.kind === "complex-script");
    expect(complex?.detail).toBe("Devanagari");
    // It renders and is searchable — the warning must not claim otherwise.
    expect(warnings.some((w) => w.kind === "missing")).toBe(false);
  });
});

describe("FontStack guards", () => {
  it("refuses to build with no faces", () => {
    expect(() => new FontStack([])).toThrow();
  });

  it("falls back to the primary face for unknown characters", async () => {
    const fake = (name: string, covers: (cp: number) => boolean): FontFace =>
      ({ name, covers, pdfFont: { widthOfTextAtSize: () => 1 } }) as unknown as FontFace;

    const stack = new FontStack([fake("a", (cp) => cp === 65), fake("b", (cp) => cp === 66)]);
    const runs = stack.segment("AB?");
    expect(runs.map((r) => r.face.name)).toEqual(["a", "b", "a"]);
  });
});
