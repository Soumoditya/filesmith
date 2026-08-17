import type { FontFamily } from "./fontCatalogue";

/**
 * The document model: what a resume, invoice, letter or converted Markdown
 * file all reduce to before layout.
 *
 * Deliberately small. Every block type here has to be measured, paginated
 * and drawn, so each one earns its place.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** A styled piece of text within a paragraph. */
export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Overrides the block's size. */
  size?: number;
  colour?: Rgb;
  /** Renders in the accent colour and, where supported, as a link. */
  href?: string;
}

export type Align = "left" | "centre" | "right" | "justify";

export interface Spacing {
  before?: number;
  after?: number;
}

export interface HeadingBlock extends Spacing {
  type: "heading";
  level: 1 | 2 | 3;
  runs: Inline[];
  align?: Align;
  /** Draws a hairline under the heading — common in resume section titles. */
  underline?: boolean;
}

export interface ParagraphBlock extends Spacing {
  type: "paragraph";
  runs: Inline[];
  align?: Align;
  /** Extra left indent, in points. */
  indent?: number;
  /** Overrides the document line height for this block. */
  lineHeight?: number;
}

export interface BulletsBlock extends Spacing {
  type: "bullets";
  items: Inline[][];
  /** The glyph before each item. Kept simple so every font has it. */
  marker?: string;
  indent?: number;
  /** Vertical gap between items. */
  gap?: number;
}

export interface RuleBlock extends Spacing {
  type: "rule";
  colour?: Rgb;
  thickness?: number;
}

export interface SpacerBlock {
  type: "spacer";
  height: number;
}

export interface TableColumn {
  /** Relative weight, or an absolute width in points if `fixed` is set. */
  width: number;
  fixed?: boolean;
  align?: Align;
}

export interface TableBlock extends Spacing {
  type: "table";
  columns: TableColumn[];
  /** Each row is a list of cells; each cell is a list of inline runs. */
  rows: Inline[][][];
  /** Repeats the first row at the top of each page it spills onto. */
  headerRow?: boolean;
  cellPadding?: number;
  /** Hairline between rows. */
  rowLines?: boolean;
  lineColour?: Rgb;
}

/** Wraps blocks that must not be split across a page boundary. */
export interface KeepTogetherBlock {
  type: "keepTogether";
  blocks: Block[];
}

export interface PageBreakBlock {
  type: "pageBreak";
}

export interface ImageBlock extends Spacing {
  type: "image";
  data: Uint8Array;
  format: "png" | "jpg";
  width: number;
  height: number;
  align?: Align;
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | BulletsBlock
  | RuleBlock
  | SpacerBlock
  | TableBlock
  | KeepTogetherBlock
  | PageBreakBlock
  | ImageBlock;

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSetup {
  width: number;
  height: number;
  margins: Margins;
}

/** Points per unit, for the sizes people actually think in. */
export const MM = 72 / 25.4;
export const INCH = 72;

export const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
  legal: { width: 612, height: 1008 },
  a5: { width: 419.53, height: 595.28 },
} as const;

export type PageSizeName = keyof typeof PAGE_SIZES;

export function pageSetup(
  size: PageSizeName,
  marginPt: number | Partial<Margins> = 54,
  landscape = false,
): PageSetup {
  const base = PAGE_SIZES[size];
  const [width, height] = landscape
    ? [base.height, base.width]
    : [base.width, base.height];

  const margins: Margins =
    typeof marginPt === "number"
      ? { top: marginPt, right: marginPt, bottom: marginPt, left: marginPt }
      : { top: 54, right: 54, bottom: 54, left: 54, ...marginPt };

  return { width, height, margins };
}

export interface DocStyle {
  family: FontFamily;
  /** Body text size in points. */
  baseSize: number;
  /** Multiplier applied to the font size to get line spacing. */
  lineHeight: number;
  colour: Rgb;
  accent: Rgb;
  /** Size multipliers for h1/h2/h3, relative to `baseSize`. */
  headingScale: [number, number, number];
}

export const DEFAULT_STYLE: DocStyle = {
  family: "sans",
  baseSize: 10.5,
  lineHeight: 1.35,
  colour: { r: 0.11, g: 0.1, b: 0.09 },
  accent: { r: 0.867, g: 0.361, b: 0.082 },
  headingScale: [1.85, 1.25, 1.08],
};

/** Drawn at the top or bottom of every page. */
export interface RunningText {
  /** `{n}` and `{total}` are substituted at render time. */
  template: string;
  align?: Align;
  size?: number;
  colour?: Rgb;
  /** Skip on the first page — the usual choice for a title page. */
  skipFirst?: boolean;
}

export interface DocumentSpec {
  page: PageSetup;
  style: DocStyle;
  blocks: Block[];
  header?: RunningText;
  footer?: RunningText;
  title?: string;
  author?: string;
}
