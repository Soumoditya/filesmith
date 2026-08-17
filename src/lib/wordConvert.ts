import type { Block, Inline } from "./doc/model";

/**
 * Converting between Word documents and our own document model.
 *
 * Both directions are lossy, and honestly so. A .docx carries far more than
 * this model does — floating shapes, columns, footnotes, tracked changes —
 * and a PDF carries only positioned glyphs with no structure at all. What
 * survives here is the part people actually care about: the words, their
 * order, their headings, their emphasis and their lists.
 */

/* ------------------------------------------------------------ HTML → blocks */

interface Style {
  bold?: boolean;
  italic?: boolean;
}

/** Walks a DOM tree, gathering styled runs. */
function collectRuns(node: Node, style: Style, out: Inline[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (text) out.push({ text, ...style });
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  const tag = element.tagName.toLowerCase();

  const next: Style = { ...style };
  if (tag === "b" || tag === "strong") next.bold = true;
  if (tag === "i" || tag === "em") next.italic = true;

  if (tag === "br") {
    out.push({ text: " " });
    return;
  }

  for (const child of Array.from(element.childNodes)) {
    collectRuns(child, next, out);
  }
}

/** Merges adjacent runs sharing a style, so the layout engine does less work. */
function tidy(runs: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const run of runs) {
    const last = out.at(-1);
    if (last && !!last.bold === !!run.bold && !!last.italic === !!run.italic) {
      last.text += run.text;
    } else {
      out.push({ ...run });
    }
  }
  return out.filter((r) => r.text.length > 0);
}

/**
 * Turns the HTML mammoth produces into document blocks.
 *
 * Parsed with DOMParser rather than a regex: Word emits deeply nested inline
 * markup, and anything less than a real parser mangles it.
 */
export function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: Block[] = [];

  const walk = (element: Element) => {
    const tag = element.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      const runs: Inline[] = [];
      collectRuns(element, {}, runs);
      const level = Math.min(Number(tag[1]), 3) as 1 | 2 | 3;
      if (runs.length > 0) {
        blocks.push({
          type: "heading",
          level,
          runs: tidy(runs),
          before: level === 1 ? 10 : 8,
          after: 4,
        });
      }
      return;
    }

    if (tag === "p") {
      const runs: Inline[] = [];
      collectRuns(element, {}, runs);
      const tidied = tidy(runs);
      // Word litters documents with empty paragraphs used as spacing.
      if (tidied.some((r) => r.text.trim())) {
        blocks.push({ type: "paragraph", runs: tidied, after: 6 });
      } else {
        blocks.push({ type: "spacer", height: 6 });
      }
      return;
    }

    if (tag === "ul" || tag === "ol") {
      const items: Inline[][] = [];
      let index = 1;
      for (const li of Array.from(element.querySelectorAll(":scope > li"))) {
        const runs: Inline[] = [];
        collectRuns(li, {}, runs);
        const tidied = tidy(runs);
        if (tidied.length === 0) continue;
        // Numbers are baked in because the model has one bullet marker.
        items.push(tag === "ol" ? [{ text: `${index++}. ` }, ...tidied] : tidied);
      }
      if (items.length > 0) {
        blocks.push({
          type: "bullets",
          items,
          marker: tag === "ol" ? "" : "•",
          after: 6,
        });
      }
      return;
    }

    if (tag === "table") {
      const rows: Inline[][][] = [];
      for (const tr of Array.from(element.querySelectorAll("tr"))) {
        const cells: Inline[][] = [];
        for (const cell of Array.from(tr.querySelectorAll("th, td"))) {
          const runs: Inline[] = [];
          collectRuns(cell, {}, runs);
          cells.push(tidy(runs));
        }
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length > 0) {
        const columns = rows[0].map(() => ({ width: 1 }));
        blocks.push({
          type: "table",
          columns,
          rows,
          headerRow: element.querySelector("th") !== null,
          rowLines: true,
          after: 8,
        });
      }
      return;
    }

    if (tag === "hr") {
      blocks.push({ type: "rule", before: 6, after: 6 });
      return;
    }

    for (const child of Array.from(element.children)) walk(child);
  };

  for (const child of Array.from(doc.body.children)) walk(child);
  return blocks;
}

/* ------------------------------------------------------ PDF text → paragraphs */

export interface PositionedItem {
  text: string;
  /** Baseline position, PDF points from the bottom-left. */
  x: number;
  y: number;
  height: number;
  bold?: boolean;
}

export interface ExtractedParagraph {
  text: string;
  /** Rough guess at a heading level, or 0 for body text. */
  heading: 0 | 1 | 2 | 3;
  bullet: boolean;
}

/**
 * Groups positioned glyph runs back into paragraphs.
 *
 * A PDF has no paragraphs — only text placed at coordinates — so structure has
 * to be inferred from geometry: items sharing a baseline are one line, a wider
 * than usual gap between lines starts a new paragraph, and text noticeably
 * larger than the body is probably a heading. This is a heuristic, which is
 * exactly why the tool warns that complex layouts convert badly.
 */
export function itemsToParagraphs(items: PositionedItem[]): ExtractedParagraph[] {
  const meaningful = items.filter((i) => i.text.trim());
  if (meaningful.length === 0) return [];

  // Group into lines by baseline, allowing for slight drift.
  const lines: PositionedItem[][] = [];
  const sorted = [...meaningful].sort((a, b) => b.y - a.y || a.x - b.x);

  for (const item of sorted) {
    const last = lines.at(-1);
    if (last && Math.abs(last[0].y - item.y) < Math.max(item.height * 0.5, 2)) {
      last.push(item);
    } else {
      lines.push([item]);
    }
  }

  const lineInfo = lines.map((line) => {
    const ordered = [...line].sort((a, b) => a.x - b.x);

    // Items on one line may or may not carry their own spacing. Joining them
    // blindly glues words together ("Helloworld"); always inserting a space
    // breaks words that a kerning adjustment split mid-token ("Hel" "lo").
    // So the horizontal gap decides: text is only separated when the next run
    // starts noticeably beyond where the previous one should have ended.
    let text = "";
    for (const [index, item] of ordered.entries()) {
      if (index > 0) {
        const previous = ordered[index - 1];
        // Proportional faces average roughly half the point size per glyph.
        const estimatedEnd = previous.x + previous.text.length * previous.height * 0.5;
        const gap = item.x - estimatedEnd;
        const alreadySpaced = /\s$/.test(text) || /^\s/.test(item.text);
        if (!alreadySpaced && gap > previous.height * 0.2) text += " ";
      }
      text += item.text;
    }

    return {
      text: text.replace(/\s+/g, " ").trim(),
      y: ordered[0].y,
      x: ordered[0].x,
      size: Math.max(...ordered.map((i) => i.height)),
      bold: ordered.some((i) => i.bold),
    };
  });

  // The most common text size is the body size; anything bigger is a heading.
  const counts = new Map<number, number>();
  for (const line of lineInfo) {
    const key = Math.round(line.size);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const bodySize =
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;

  const paragraphs: ExtractedParagraph[] = [];
  let current: { parts: string[]; heading: 0 | 1 | 2 | 3; bullet: boolean } | null = null;

  const flush = () => {
    if (current && current.parts.length > 0) {
      paragraphs.push({
        text: current.parts.join(" ").replace(/\s+/g, " ").trim(),
        heading: current.heading,
        bullet: current.bullet,
      });
    }
    current = null;
  };

  for (const [index, line] of lineInfo.entries()) {
    if (!line.text) {
      flush();
      continue;
    }

    const ratio = line.size / bodySize;
    const heading: 0 | 1 | 2 | 3 =
      ratio >= 1.6 ? 1 : ratio >= 1.3 ? 2 : ratio >= 1.13 || (line.bold && ratio > 1.02) ? 3 : 0;
    const bullet = /^[•·▪◦‣\-–—*]\s+/.test(line.text);

    const previous = lineInfo[index - 1];
    // A gap noticeably bigger than one line means a new paragraph.
    const gap = previous ? previous.y - line.y : 0;
    const newBlock =
      !current ||
      heading !== current.heading ||
      bullet ||
      (previous && gap > line.size * 1.8);

    if (newBlock) {
      flush();
      current = {
        parts: [bullet ? line.text.replace(/^[•·▪◦‣\-–—*]\s+/, "") : line.text],
        heading,
        bullet,
      };
    } else {
      current!.parts.push(line.text);
    }
  }

  flush();
  return paragraphs;
}
