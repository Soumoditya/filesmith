import type { PDFFont } from "@cantoo/pdf-lib";

/**
 * A font stack: several font faces tried in order, so a single line of text
 * can mix scripts and symbols that no one font file covers.
 *
 * This exists because the built-in PDF fonts silently replace anything they
 * can't encode with "?" — no exception is thrown. Worse, the popular webfont
 * packages ship fonts already split by Unicode range, so "Inter" alone does
 * not contain `₹` (it lives in the latin-ext subset). Without a fallback
 * chain, an invoice would quietly render every rupee amount as a blank.
 */

export interface FontFace {
  /** For drawing and metrics. */
  pdfFont: PDFFont;
  /** True if this face has a real glyph for the code point. */
  covers: (codePoint: number) => boolean;
  /** Debug label, e.g. "Inter latin-ext 400". */
  name: string;
}

export interface TextRun {
  text: string;
  face: FontFace;
}

/**
 * Scripts that need contextual shaping — reordering marks, forming
 * conjuncts — which pdf-lib's one-glyph-per-code-point drawing cannot do.
 * Text in these ranges still carries correct *characters* (so it copies and
 * searches fine) but the visual glyph forms will be wrong.
 */
const COMPLEX_RANGES: Array<[number, number, string]> = [
  [0x0900, 0x097f, "Devanagari"],
  [0x0980, 0x09ff, "Bengali"],
  [0x0a00, 0x0a7f, "Gurmukhi"],
  [0x0a80, 0x0aff, "Gujarati"],
  [0x0b00, 0x0b7f, "Odia"],
  [0x0b80, 0x0bff, "Tamil"],
  [0x0c00, 0x0c7f, "Telugu"],
  [0x0c80, 0x0cff, "Kannada"],
  [0x0d00, 0x0d7f, "Malayalam"],
  [0x0e00, 0x0e7f, "Thai"],
  [0x0600, 0x06ff, "Arabic"],
  [0x0590, 0x05ff, "Hebrew"],
];

export function complexScriptIn(text: string): string | null {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    for (const [lo, hi, name] of COMPLEX_RANGES) {
      if (cp >= lo && cp <= hi) return name;
    }
  }
  return null;
}

export class FontStack {
  readonly faces: FontFace[];

  constructor(faces: FontFace[]) {
    if (faces.length === 0) throw new Error("A font stack needs at least one face.");
    this.faces = faces;
  }

  /** The face used when nothing covers a character. */
  get primary(): FontFace {
    return this.faces[0];
  }

  private faceFor(codePoint: number): FontFace {
    for (const face of this.faces) {
      if (face.covers(codePoint)) return face;
    }
    return this.primary;
  }

  /**
   * Splits text into the longest possible runs that share one face, so
   * drawing stays cheap. Iterates by code point, not by UTF-16 unit, so
   * emoji and other astral characters aren't torn in half.
   */
  segment(text: string): TextRun[] {
    if (!text) return [];

    const runs: TextRun[] = [];
    let current: TextRun | null = null;

    for (const ch of text) {
      const face = this.faceFor(ch.codePointAt(0)!);
      if (current && current.face === face) {
        current.text += ch;
      } else {
        current = { text: ch, face };
        runs.push(current);
      }
    }

    return runs;
  }

  /** Width of the text at a size, measured across face boundaries. */
  widthOf(text: string, size: number): number {
    let total = 0;
    for (const run of this.segment(text)) {
      total += run.face.pdfFont.widthOfTextAtSize(run.text, size);
    }
    return total;
  }

  /** Line height suggested by the primary face. */
  heightOf(size: number): number {
    return this.primary.pdfFont.heightAtSize(size);
  }

  /** Distinct characters that no face in the stack can draw. */
  uncovered(text: string): string[] {
    const missing = new Set<string>();
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      // Whitespace and control characters never need a glyph.
      if (cp <= 0x20) continue;
      if (!this.faces.some((f) => f.covers(cp))) missing.add(ch);
    }
    return [...missing];
  }
}

export interface CoverageWarning {
  kind: "missing" | "complex-script";
  message: string;
  /** The offending characters, or the script name. */
  detail: string;
}

/**
 * Checks a whole document's text up front so the user can be told before
 * they download something subtly wrong.
 */
export function checkCoverage(stack: FontStack, text: string): CoverageWarning[] {
  const warnings: CoverageWarning[] = [];

  const missing = stack.uncovered(text);
  if (missing.length > 0) {
    warnings.push({
      kind: "missing",
      detail: missing.join(" "),
      message: `These characters aren’t in the font you’ve chosen and will come out blank: ${missing
        .slice(0, 12)
        .join(" ")}${missing.length > 12 ? "…" : ""}. Try a different font.`,
    });
  }

  const script = complexScriptIn(text);
  if (script) {
    warnings.push({
      kind: "complex-script",
      detail: script,
      message: `${script} text will be readable and searchable, but letters that should join together won’t be shaped correctly yet. For now it’s best used for short items like names rather than whole paragraphs.`,
    });
  }

  return warnings;
}
