import type { Block, Inline } from "./doc/model";

/**
 * A small Markdown reader, producing document blocks directly.
 *
 * Deliberately not a full CommonMark implementation. It covers what people
 * actually type when they want a tidy PDF — headings, bold, italic, lists,
 * quotes, code, rules, tables — and treats anything else as plain text rather
 * than swallowing it. Pulling in a full parser plus an HTML bridge would cost
 * far more than it returns for this.
 */

/** Splits a line into styled runs, handling **bold**, *italic*, `code` and links. */
export function parseInline(line: string): Inline[] {
  const runs: Inline[] = [];
  // Order matters: bold before italic, or `**x**` reads as two italics.
  const pattern =
    /(\*\*\*|___)(.+?)\1|(\*\*|__)(.+?)\3|(\*|_)(.+?)\5|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;

  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > index) runs.push({ text: line.slice(index, match.index) });

    if (match[2] !== undefined) {
      runs.push({ text: match[2], bold: true, italic: true });
    } else if (match[4] !== undefined) {
      runs.push({ text: match[4], bold: true });
    } else if (match[6] !== undefined) {
      runs.push({ text: match[6], italic: true });
    } else if (match[7] !== undefined) {
      // No monospace inline run in the model, so code is set apart by weight.
      runs.push({ text: match[7], bold: true });
    } else if (match[8] !== undefined) {
      runs.push({ text: match[8], href: match[9] });
    }

    index = pattern.lastIndex;
  }

  if (index < line.length) runs.push({ text: line.slice(index) });
  return runs.length > 0 ? runs : [{ text: line }];
}

function tableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const isSeparatorRow = (cells: string[]) =>
  cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s/g, "")));

export interface MarkdownOptions {
  /** Start each top-level heading on a fresh page. */
  pageBreakOnHeading?: boolean;
  /** Treat single newlines as line breaks rather than joining paragraphs. */
  preserveLineBreaks?: boolean;
}

export function markdownToBlocks(
  source: string,
  options: MarkdownOptions = {},
): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let bullets: Inline[][] | null = null;
  let ordered = false;
  let orderedIndex = 1;
  let codeLines: string[] | null = null;
  let quote: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const joined = options.preserveLineBreaks
      ? paragraph.join("\n")
      : paragraph.join(" ");
    blocks.push({ type: "paragraph", runs: parseInline(joined), after: 7 });
    paragraph = [];
  };

  const flushBullets = () => {
    if (!bullets || bullets.length === 0) {
      bullets = null;
      return;
    }
    blocks.push({
      type: "bullets",
      items: bullets,
      marker: ordered ? "" : "•",
      after: 7,
      gap: 2,
    });
    bullets = null;
    orderedIndex = 1;
  };

  const flushQuote = () => {
    if (!quote || quote.length === 0) {
      quote = null;
      return;
    }
    blocks.push({
      type: "paragraph",
      runs: parseInline(quote.join(" ")).map((r) => ({
        ...r,
        italic: true,
        colour: { r: 0.35, g: 0.33, b: 0.31 },
      })),
      indent: 16,
      after: 7,
    });
    quote = null;
  };

  const flushCode = () => {
    if (!codeLines) return;
    blocks.push({
      type: "paragraph",
      runs: [{ text: codeLines.join("\n"), size: 9 }],
      lineHeight: 1.25,
      indent: 12,
      before: 2,
      after: 8,
    });
    codeLines = null;
  };

  const flushAll = () => {
    flushParagraph();
    flushBullets();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code runs verbatim until the closing fence.
    if (/^```/.test(trimmed)) {
      if (codeLines) flushCode();
      else {
        flushAll();
        codeLines = [];
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }

    if (trimmed === "") {
      flushAll();
      continue;
    }

    // Tables: a header row followed by a |---|---| separator.
    const cells = tableRow(line);
    if (cells) {
      const next = tableRow(lines[i + 1] ?? "");
      if (next && isSeparatorRow(next)) {
        flushAll();
        const rows: Inline[][][] = [cells.map((c) => parseInline(c))];
        let cursor = i + 2;
        while (cursor < lines.length) {
          const row = tableRow(lines[cursor]);
          if (!row) break;
          rows.push(row.map((c) => parseInline(c)));
          cursor++;
        }
        blocks.push({
          type: "table",
          columns: cells.map(() => ({ width: 1 })),
          rows,
          headerRow: true,
          rowLines: true,
          after: 8,
        });
        i = cursor - 1;
        continue;
      }
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      if (options.pageBreakOnHeading && level === 1 && blocks.length > 0) {
        blocks.push({ type: "pageBreak" });
      }
      blocks.push({
        type: "heading",
        level,
        runs: parseInline(heading[2]),
        before: level === 1 ? 12 : 10,
        after: 5,
      });
      continue;
    }

    if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(trimmed)) {
      flushAll();
      blocks.push({ type: "rule", before: 6, after: 8 });
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (bullets && ordered) flushBullets();
      ordered = false;
      bullets ??= [];
      bullets.push(parseInline(bullet[1]));
      continue;
    }

    const numbered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      flushParagraph();
      flushQuote();
      if (bullets && !ordered) flushBullets();
      if (!bullets) orderedIndex = Number(numbered[1]) || 1;
      ordered = true;
      bullets ??= [];
      bullets.push([{ text: `${orderedIndex++}. ` }, ...parseInline(numbered[2])]);
      continue;
    }

    const quoted = trimmed.match(/^>\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      flushBullets();
      quote ??= [];
      quote.push(quoted[1]);
      continue;
    }

    flushBullets();
    flushQuote();
    paragraph.push(trimmed);
  }

  flushCode();
  flushAll();
  return blocks;
}

/** Words, characters and a reading estimate — shown live in the editor. */
export function textStats(source: string) {
  const trimmed = source.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    words,
    characters: source.length,
    charactersNoSpaces: source.replace(/\s/g, "").length,
    paragraphs: trimmed ? trimmed.split(/\n{2,}/).filter((p) => p.trim()).length : 0,
    // 225 words a minute is the usual estimate for silent reading.
    readingMinutes: Math.max(1, Math.round(words / 225)),
  };
}

export const SAMPLE_MARKDOWN = `# Meeting notes

**Date:** 12 March 2026
**Present:** Asha, Ravi, Meera

## What we agreed

- Ship the new pricing page before the end of the month
- Move the weekly review to Thursday
- Ravi to write up the migration plan

## Numbers

| Region | Q1 | Q2 |
|---|---|---|
| North | 1,240 | 1,610 |
| South | 980 | 1,150 |

> The South figure excludes the two accounts still in onboarding.

## Next steps

1. Circulate this note by Friday
2. Book the room for next month
3. Review the *draft* plan together

---

Anything else, reply on the thread.
`;
