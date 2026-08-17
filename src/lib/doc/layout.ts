import type { FontFace, FontStack } from "./fontStack";
import {
  BLACK,
  type Align,
  type Block,
  type DocStyle,
  type DocumentSpec,
  type Inline,
  type Rgb,
  type TableBlock,
} from "./model";

/**
 * Turns a document spec into positioned, page-broken drawing instructions.
 *
 * Two passes: blocks become a flat list of "groups" of drawables with real
 * measured heights, then groups are packed onto pages. Keeping measurement
 * separate from pagination is what makes orphan control, keep-together and
 * repeating table headers tractable.
 *
 * All coordinates here are top-down from the content box; the renderer flips
 * them into PDF's bottom-up space.
 */

/** Resolves a weight/style combination to the right fallback stack. */
export interface FontSet {
  get(bold: boolean, italic: boolean): FontStack;
}

export interface DrawRun {
  text: string;
  face: FontFace;
  size: number;
  colour: Rgb;
  /** Offset from the line's left edge. */
  x: number;
  width: number;
  href?: string;
}

export interface DrawLine {
  kind: "line";
  runs: DrawRun[];
  height: number;
  /** Distance from the line's top to the text baseline. */
  ascent: number;
}

export interface DrawRule {
  kind: "rule";
  height: number;
  width: number;
  x: number;
  colour: Rgb;
  thickness: number;
}

export interface DrawSpace {
  kind: "space";
  height: number;
}

export interface DrawImage {
  kind: "image";
  data: Uint8Array;
  format: "png" | "jpg";
  width: number;
  height: number;
  x: number;
}

export type Drawable = DrawLine | DrawRule | DrawSpace | DrawImage;

interface Group {
  drawables: Drawable[];
  /** Never split this group across a page boundary. */
  keepTogether: boolean;
  /** Minimum lines to leave on either side of a break (orphans/widows). */
  minKeep: number;
  forcePageBreak?: boolean;
}

export interface PlacedItem {
  drawable: Drawable;
  /** Distance from the top of the content box. */
  y: number;
}

export interface LaidOutPage {
  items: PlacedItem[];
}

export interface LaidOutDocument {
  pages: LaidOutPage[];
  contentWidth: number;
  contentHeight: number;
}

/* ------------------------------------------------------------------ text */

interface Token {
  text: string;
  isSpace: boolean;
  bold: boolean;
  italic: boolean;
  size: number;
  colour: Rgb;
  href?: string;
  width: number;
}

function tokenise(
  runs: Inline[],
  fonts: FontSet,
  style: DocStyle,
  defaultSize: number,
): Token[] {
  const tokens: Token[] = [];

  for (const run of runs) {
    const bold = run.bold ?? false;
    const italic = run.italic ?? false;
    const size = run.size ?? defaultSize;
    const colour = run.colour ?? (run.href ? style.accent : style.colour);
    const stack = fonts.get(bold, italic);

    // Keep the separators so spacing survives a run boundary.
    for (const piece of run.text.split(/(\s+)/)) {
      if (piece === "") continue;
      tokens.push({
        text: piece,
        isSpace: /^\s+$/.test(piece),
        bold,
        italic,
        size,
        colour,
        href: run.href,
        width: stack.widthOf(piece, size),
      });
    }
  }

  return tokens;
}

/** Splits a token too wide for any line into pieces that do fit. */
function breakLongToken(token: Token, fonts: FontSet, maxWidth: number): Token[] {
  const stack = fonts.get(token.bold, token.italic);
  const pieces: Token[] = [];
  let current = "";

  for (const ch of token.text) {
    const next = current + ch;
    if (current && stack.widthOf(next, token.size) > maxWidth) {
      pieces.push({ ...token, text: current, width: stack.widthOf(current, token.size) });
      current = ch;
    } else {
      current = next;
    }
  }

  if (current) {
    pieces.push({ ...token, text: current, width: stack.widthOf(current, token.size) });
  }
  return pieces.length > 0 ? pieces : [token];
}

function buildLine(
  tokens: Token[],
  fonts: FontSet,
  width: number,
  align: Align,
  lineHeight: number,
  isLastLine: boolean,
): DrawLine {
  // Trailing whitespace must not affect alignment or justification.
  const trimmed = [...tokens];
  while (trimmed.length > 0 && trimmed.at(-1)!.isSpace) trimmed.pop();
  while (trimmed.length > 0 && trimmed[0].isSpace) trimmed.shift();

  const textWidth = trimmed.reduce((sum, t) => sum + t.width, 0);
  const maxSize = trimmed.reduce((m, t) => Math.max(m, t.size), 0) || 1;
  const height = maxSize * lineHeight;
  // Typographic ascent is roughly 80% of the em box for these faces; using
  // it keeps successive lines evenly spaced regardless of mixed sizes.
  const ascent = maxSize * 0.8 + (height - maxSize) / 2;

  let x = 0;
  let extraPerGap = 0;

  if (align === "centre") x = (width - textWidth) / 2;
  else if (align === "right") x = width - textWidth;
  else if (align === "justify" && !isLastLine) {
    const gaps = trimmed.filter((t) => t.isSpace).length;
    if (gaps > 0) extraPerGap = (width - textWidth) / gaps;
  }

  const drawRuns: DrawRun[] = [];
  for (const token of trimmed) {
    const stack = fonts.get(token.bold, token.italic);
    // A token may still span several faces — "₹500" is latin-ext then latin.
    for (const seg of stack.segment(token.text)) {
      const w = seg.face.pdfFont.widthOfTextAtSize(seg.text, token.size);
      if (!token.isSpace) {
        drawRuns.push({
          text: seg.text,
          face: seg.face,
          size: token.size,
          colour: token.colour,
          href: token.href,
          x,
          width: w,
        });
      }
      x += w;
    }
    if (token.isSpace) x += extraPerGap;
  }

  return { kind: "line", runs: drawRuns, height, ascent };
}

export function wrapText(
  runs: Inline[],
  fonts: FontSet,
  style: DocStyle,
  width: number,
  size: number,
  align: Align = "left",
  lineHeight = style.lineHeight,
): DrawLine[] {
  const tokens = tokenise(runs, fonts, style, size);
  if (tokens.length === 0) {
    // An empty paragraph still occupies a line, which is what people expect
    // from a blank line in their source text.
    return [{ kind: "line", runs: [], height: size * lineHeight, ascent: size * 0.8 }];
  }

  const lines: DrawLine[] = [];
  let current: Token[] = [];
  let currentWidth = 0;

  const flush = (isLast: boolean) => {
    if (current.length > 0) {
      lines.push(buildLine(current, fonts, width, align, lineHeight, isLast));
    }
    current = [];
    currentWidth = 0;
  };

  for (let token of tokens) {
    if (!token.isSpace && token.width > width) {
      flush(false);
      const pieces = breakLongToken(token, fonts, width);
      for (const piece of pieces.slice(0, -1)) {
        lines.push(buildLine([piece], fonts, width, align, lineHeight, false));
      }
      token = pieces.at(-1)!;
    }

    // A space that would overflow just ends the line; it is never carried.
    if (currentWidth + token.width > width && current.length > 0) {
      if (token.isSpace) {
        flush(false);
        continue;
      }
      flush(false);
    }

    if (token.isSpace && current.length === 0) continue;

    current.push(token);
    currentWidth += token.width;
  }

  flush(true);
  return lines;
}

/* ---------------------------------------------------------------- blocks */

function sizeForHeading(style: DocStyle, level: 1 | 2 | 3): number {
  return style.baseSize * style.headingScale[level - 1];
}

function alignOffset(align: Align, width: number, itemWidth: number): number {
  if (align === "centre") return (width - itemWidth) / 2;
  if (align === "right") return width - itemWidth;
  return 0;
}

function layoutTable(
  block: TableBlock,
  fonts: FontSet,
  style: DocStyle,
  width: number,
): { header: Drawable[] | null; rows: Drawable[][] } {
  const padding = block.cellPadding ?? 4;
  const lineColour = block.lineColour ?? { r: 0.85, g: 0.84, b: 0.83 };

  // Fixed columns take their width first; the rest share what's left.
  const fixedTotal = block.columns
    .filter((c) => c.fixed)
    .reduce((sum, c) => sum + c.width, 0);
  const flexWeight = block.columns
    .filter((c) => !c.fixed)
    .reduce((sum, c) => sum + c.width, 0);
  const flexSpace = Math.max(width - fixedTotal, 0);

  const columnWidths = block.columns.map((c) =>
    c.fixed ? c.width : flexWeight > 0 ? (c.width / flexWeight) * flexSpace : 0,
  );

  const buildRow = (cells: Inline[][]): Drawable[] => {
    const columns = cells.map((cell, i) => {
      const inner = Math.max(columnWidths[i] - padding * 2, 1);
      return wrapText(
        cell,
        fonts,
        style,
        inner,
        style.baseSize,
        block.columns[i]?.align ?? "left",
      );
    });

    const rowHeight =
      Math.max(...columns.map((lines) => lines.reduce((s, l) => s + l.height, 0))) +
      padding * 2;

    // Cells are merged into single-height lines positioned by column offset,
    // so the pagination pass only ever deals with a flat drawable list.
    const merged: Drawable[] = [];
    let maxLines = Math.max(...columns.map((c) => c.length));

    for (let lineIndex = 0; lineIndex < maxLines; lineIndex++) {
      const runs: DrawRun[] = [];
      let height = 0;
      let ascent = 0;
      let offset = 0;

      columns.forEach((lines, colIndex) => {
        const line = lines[lineIndex];
        if (line) {
          for (const run of line.runs) {
            runs.push({ ...run, x: offset + padding + run.x });
          }
          height = Math.max(height, line.height);
          ascent = Math.max(ascent, line.ascent);
        }
        offset += columnWidths[colIndex];
      });

      merged.push({
        kind: "line",
        runs,
        height: height || style.baseSize * style.lineHeight,
        ascent: ascent || style.baseSize * 0.8,
      });
    }

    const used = merged.reduce((s, d) => s + d.height, 0);
    merged.unshift({ kind: "space", height: padding });
    merged.push({ kind: "space", height: Math.max(rowHeight - used - padding, padding) });

    if (block.rowLines) {
      merged.push({
        kind: "rule",
        height: 1,
        width,
        x: 0,
        colour: lineColour,
        thickness: 0.5,
      });
    }

    return merged;
  };

  const rows = block.rows.map(buildRow);
  const header = block.headerRow && rows.length > 0 ? rows[0] : null;

  return { header, rows: header ? rows.slice(1) : rows };
}

function blockToGroups(
  block: Block,
  fonts: FontSet,
  style: DocStyle,
  width: number,
): Group[] {
  const space = (h: number | undefined): Drawable[] =>
    h && h > 0 ? [{ kind: "space", height: h }] : [];

  switch (block.type) {
    case "spacer":
      return [{ drawables: [{ kind: "space", height: block.height }], keepTogether: false, minKeep: 1 }];

    case "pageBreak":
      return [{ drawables: [], keepTogether: false, minKeep: 1, forcePageBreak: true }];

    case "rule":
      return [
        {
          drawables: [
            ...space(block.before),
            {
              kind: "rule",
              height: block.thickness ?? 1,
              width,
              x: 0,
              colour: block.colour ?? { r: 0.85, g: 0.84, b: 0.83 },
              thickness: block.thickness ?? 1,
            },
            ...space(block.after),
          ],
          keepTogether: true,
          minKeep: 1,
        },
      ];

    case "heading": {
      const size = sizeForHeading(style, block.level);
      const lines = wrapText(block.runs, fonts, style, width, size, block.align ?? "left", 1.2);
      const drawables: Drawable[] = [...space(block.before), ...lines];
      if (block.underline) {
        drawables.push(
          { kind: "space", height: 3 },
          { kind: "rule", height: 1, width, x: 0, colour: style.accent, thickness: 0.75 },
        );
      }
      drawables.push(...space(block.after));
      // A heading alone at the foot of a page is the classic layout sin.
      return [{ drawables, keepTogether: true, minKeep: 1 }];
    }

    case "paragraph": {
      const indent = block.indent ?? 0;
      const lines = wrapText(
        block.runs,
        fonts,
        style,
        width - indent,
        style.baseSize,
        block.align ?? "left",
        block.lineHeight ?? style.lineHeight,
      );
      const shifted = lines.map((line) => ({
        ...line,
        runs: line.runs.map((r) => ({ ...r, x: r.x + indent })),
      }));
      return [
        {
          drawables: [...space(block.before), ...shifted, ...space(block.after)],
          keepTogether: false,
          minKeep: 2,
        },
      ];
    }

    case "bullets": {
      const marker = block.marker ?? "•";
      const indent = block.indent ?? 12;
      const gap = block.gap ?? 2;
      const markerWidth = fonts.get(false, false).widthOf(`${marker} `, style.baseSize);
      const groups: Group[] = [];

      block.items.forEach((item, index) => {
        const lines = wrapText(
          item,
          fonts,
          style,
          width - indent - markerWidth,
          style.baseSize,
        );

        const shifted: Drawable[] = lines.map((line, lineIndex) => {
          const runs = line.runs.map((r) => ({ ...r, x: r.x + indent + markerWidth }));
          if (lineIndex === 0) {
            const face = fonts.get(false, false).segment(marker)[0].face;
            runs.unshift({
              text: marker,
              face,
              size: style.baseSize,
              colour: style.colour,
              x: indent,
              width: markerWidth,
            });
          }
          return { ...line, runs };
        });

        groups.push({
          drawables: [
            ...(index === 0 ? space(block.before) : []),
            ...shifted,
            ...(index === block.items.length - 1 ? space(block.after) : space(gap)),
          ],
          // A bullet is a unit — splitting one across pages reads as broken.
          keepTogether: true,
          minKeep: 1,
        });
      });

      return groups;
    }

    case "image": {
      const scale = Math.min(width / block.width, 1);
      const w = block.width * scale;
      const h = block.height * scale;
      return [
        {
          drawables: [
            ...space(block.before),
            {
              kind: "image",
              data: block.data,
              format: block.format,
              width: w,
              height: h,
              x: alignOffset(block.align ?? "left", width, w),
            },
            ...space(block.after),
          ],
          keepTogether: true,
          minKeep: 1,
        },
      ];
    }

    case "table": {
      const { header, rows } = layoutTable(block, fonts, style, width);
      const groups: Group[] = [];
      if (block.before) {
        groups.push({ drawables: space(block.before), keepTogether: false, minKeep: 1 });
      }
      rows.forEach((row) => {
        groups.push({
          drawables: row,
          keepTogether: true,
          minKeep: 1,
          ...(header ? { repeatHeader: header } : {}),
        } as Group);
      });
      if (header) {
        groups.unshift({ drawables: header, keepTogether: true, minKeep: 1 });
      }
      if (block.after) {
        groups.push({ drawables: space(block.after), keepTogether: false, minKeep: 1 });
      }
      return groups;
    }

    case "keepTogether": {
      const inner = block.blocks.flatMap((b) => blockToGroups(b, fonts, style, width));
      return [
        {
          drawables: inner.flatMap((g) => g.drawables),
          keepTogether: true,
          minKeep: 1,
        },
      ];
    }
  }
}

const heightOf = (drawables: Drawable[]) =>
  drawables.reduce((sum, d) => sum + d.height, 0);

/* ------------------------------------------------------------ pagination */

function paginate(groups: Group[], contentHeight: number): LaidOutPage[] {
  const pages: LaidOutPage[] = [];
  let items: PlacedItem[] = [];
  let y = 0;

  const newPage = () => {
    pages.push({ items });
    items = [];
    y = 0;
  };

  for (const group of groups) {
    if (group.forcePageBreak) {
      if (items.length > 0) newPage();
      continue;
    }

    const groupHeight = heightOf(group.drawables);
    const remaining = contentHeight - y;

    // Whole group fits: place it.
    if (groupHeight <= remaining) {
      for (const drawable of group.drawables) {
        items.push({ drawable, y });
        y += drawable.height;
      }
      continue;
    }

    // Doesn't fit, but would on a fresh page: move it wholesale.
    if (group.keepTogether || groupHeight <= contentHeight) {
      if (items.length > 0) newPage();
      // Still too tall for any page (a very long unbreakable block): let it
      // overflow rather than loop forever.
      for (const drawable of group.drawables) {
        if (y > 0 && y + drawable.height > contentHeight) newPage();
        items.push({ drawable, y });
        y += drawable.height;
      }
      continue;
    }

    // Splittable and taller than a page: break it, respecting orphans.
    const lines = group.drawables;
    let index = 0;

    while (index < lines.length) {
      const linesLeftHere: Drawable[] = [];
      let used = y;

      while (index < lines.length && used + lines[index].height <= contentHeight) {
        linesLeftHere.push(lines[index]);
        used += lines[index].height;
        index++;
      }

      const placedTextLines = linesLeftHere.filter((d) => d.kind === "line").length;
      const remainingTextLines = lines.slice(index).filter((d) => d.kind === "line").length;

      // Orphan control: too few lines to leave behind, so push the lot on.
      if (
        placedTextLines > 0 &&
        placedTextLines < group.minKeep &&
        remainingTextLines > 0 &&
        items.length > 0
      ) {
        index -= linesLeftHere.length;
        newPage();
        continue;
      }

      // Widow control: too few lines would carry over, so pull one back.
      if (
        remainingTextLines > 0 &&
        remainingTextLines < group.minKeep &&
        placedTextLines > group.minKeep
      ) {
        const pull = group.minKeep - remainingTextLines;
        for (let k = 0; k < pull && linesLeftHere.length > 0; k++) {
          linesLeftHere.pop();
          index--;
        }
      }

      for (const drawable of linesLeftHere) {
        items.push({ drawable, y });
        y += drawable.height;
      }

      if (index < lines.length) newPage();
    }
  }

  if (items.length > 0 || pages.length === 0) pages.push({ items });
  return pages;
}

export function layoutDocument(spec: DocumentSpec, fonts: FontSet): LaidOutDocument {
  const contentWidth = spec.page.width - spec.page.margins.left - spec.page.margins.right;
  const contentHeight = spec.page.height - spec.page.margins.top - spec.page.margins.bottom;

  const groups = spec.blocks.flatMap((block) =>
    blockToGroups(block, fonts, spec.style, contentWidth),
  );

  return { pages: paginate(groups, contentHeight), contentWidth, contentHeight };
}

/** Every character in the document, for a font coverage check. */
export function collectText(blocks: Block[]): string {
  const parts: string[] = [];

  const fromRuns = (runs: Inline[]) => {
    for (const run of runs) parts.push(run.text);
  };

  const walk = (list: Block[]) => {
    for (const block of list) {
      switch (block.type) {
        case "heading":
        case "paragraph":
          fromRuns(block.runs);
          break;
        case "bullets":
          for (const item of block.items) fromRuns(item);
          break;
        case "table":
          for (const row of block.rows) for (const cell of row) fromRuns(cell);
          break;
        case "keepTogether":
          walk(block.blocks);
          break;
        default:
          break;
      }
    }
  };

  walk(blocks);
  return parts.join(" ");
}

export { BLACK };
