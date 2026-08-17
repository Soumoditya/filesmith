/**
 * Parsing "1-3, 5, 9-" the way people actually type it.
 *
 * Order is preserved rather than sorted: someone who types "5, 1-2" for an
 * extraction means they want page 5 first. Duplicates are dropped, keeping
 * the first occurrence.
 */

export interface ParsedRange {
  /** 1-based page numbers, in the order given. */
  pages: number[];
  /** Human-readable reason the input is unusable, or null if it's fine. */
  error: string | null;
}

export function parsePageRanges(input: string, totalPages: number): ParsedRange {
  const trimmed = input.trim();
  if (!trimmed) return { pages: [], error: null };

  if (/^all$/i.test(trimmed)) {
    return { pages: range(1, totalPages), error: null };
  }

  const pages: number[] = [];
  const seen = new Set<number>();
  const outOfRange = new Set<number>();

  // Whitespace separates entries, so "2 - 4" would otherwise tokenise as
  // three items. Close up the gaps around dashes before splitting.
  // En/em dashes are accepted because that's what phone keyboards and Word
  // autocorrect a hyphen into.
  const normalised = trimmed.replace(/\s*[-–—]\s*/g, "-");

  for (const chunk of normalised.split(/[,\s]+/).filter(Boolean)) {
    const match = chunk.match(/^(\d+)-(\d*)$/);

    if (match) {
      const from = Number(match[1]);
      const to = match[2] === "" ? totalPages : Number(match[2]);
      if (from === 0 || to === 0) return { pages: [], error: "Pages start at 1, not 0." };

      const [lo, hi] = from <= to ? [from, to] : [to, from];
      for (let p = lo; p <= hi; p++) {
        if (p > totalPages) {
          outOfRange.add(p);
          continue;
        }
        if (!seen.has(p)) {
          seen.add(p);
          pages.push(p);
        }
      }
      continue;
    }

    if (/^\d+$/.test(chunk)) {
      const p = Number(chunk);
      if (p === 0) return { pages: [], error: "Pages start at 1, not 0." };
      if (p > totalPages) {
        outOfRange.add(p);
        continue;
      }
      if (!seen.has(p)) {
        seen.add(p);
        pages.push(p);
      }
      continue;
    }

    return {
      pages: [],
      error: `“${chunk}” isn’t a page or a range. Try something like 1-3, 5, 8.`,
    };
  }

  if (pages.length === 0 && outOfRange.size > 0) {
    return {
      pages: [],
      error: `This PDF only has ${totalPages} ${totalPages === 1 ? "page" : "pages"}.`,
    };
  }

  return { pages, error: null };
}

/** Renders a list of page numbers back into compact "1-3, 7" form. */
export function formatPageRanges(pages: number[]): string {
  if (pages.length === 0) return "";

  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current !== prev + 1) {
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = current;
    }
    prev = current;
  }

  return parts.join(", ");
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

/** Splits a page list into runs of consecutive pages. */
export function consecutiveRuns(pages: number[]): number[][] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const runs: number[][] = [];

  for (const page of sorted) {
    const last = runs.at(-1);
    if (last && page === last.at(-1)! + 1) last.push(page);
    else runs.push([page]);
  }

  return runs;
}
