/**
 * Which font files back each family, weight and style.
 *
 * Every entry is a *list*, tried in order, because the webfont packages ship
 * fonts pre-split by Unicode range. "Inter" alone has no `₹` — that lives in
 * the latin-ext file — so a rupee amount needs both files loaded and a
 * fallback chain to pick between them. Devanagari is appended last so a name
 * in Hindi still finds a glyph.
 *
 * Paths are package-relative so both the browser loader (Vite `?url`) and the
 * Node tests can resolve the same list.
 */

export type FontFamily = "sans" | "serif" | "mono";
export type FontWeight = 400 | 700;
export type FontStyle = "normal" | "italic";

export interface FamilyInfo {
  id: FontFamily;
  /** What the user sees in a font picker. */
  label: string;
  /** Honest note about what it's good for. */
  note: string;
  /** True if every ATS parser handles it comfortably. */
  atsSafe: boolean;
}

export const FAMILIES: FamilyInfo[] = [
  {
    id: "sans",
    label: "Inter",
    note: "A clean, modern sans serif. A safe default for almost anything.",
    atsSafe: true,
  },
  {
    id: "serif",
    label: "Source Serif",
    note: "A traditional serif. Reads well in long documents and formal letters.",
    atsSafe: true,
  },
  {
    id: "mono",
    label: "JetBrains Mono",
    note: "Fixed width. Good for code and reference numbers, poor for prose.",
    atsSafe: false,
  },
];

const INTER = "@fontsource/inter/files/inter";
const SERIF = "@fontsource/source-serif-4/files/source-serif-4";
const MONO = "@fontsource/jetbrains-mono/files/jetbrains-mono";
const DEVA = "@fontsource/noto-sans-devanagari/files/noto-sans-devanagari";

/** Devanagari fallback, appended to every stack so Indian names render. */
const devanagari = (weight: FontWeight) => `${DEVA}-devanagari-${weight}-normal.woff`;

function stack(base: string, weight: FontWeight, style: FontStyle): string[] {
  return [
    `${base}-latin-${weight}-${style}.woff`,
    `${base}-latin-ext-${weight}-${style}.woff`,
    devanagari(weight),
  ];
}

/**
 * Inter ships no italic for latin-ext in some builds, and Noto Devanagari has
 * no italic at all, so italic stacks fall back to the upright face rather
 * than dropping the character entirely.
 */
export function filesFor(
  family: FontFamily,
  weight: FontWeight,
  style: FontStyle,
): string[] {
  const base = family === "sans" ? INTER : family === "serif" ? SERIF : MONO;
  return stack(base, weight, style);
}

/** Every file the app might need, for preloading or cache warming. */
export function allFontFiles(): string[] {
  const out = new Set<string>();
  for (const family of ["sans", "serif", "mono"] as FontFamily[]) {
    for (const weight of [400, 700] as FontWeight[]) {
      for (const style of ["normal", "italic"] as FontStyle[]) {
        for (const file of filesFor(family, weight, style)) out.add(file);
      }
    }
  }
  return [...out];
}
