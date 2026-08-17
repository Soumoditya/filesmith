/**
 * Hitting a file size limit.
 *
 * "Make this fit under 2 MB" is the single most common thing people actually
 * need — government portals, exam forms and job applications all impose hard
 * caps, and most free tools only offer vague "low/medium/high" quality.
 *
 * The search is kept separate from any encoder so it can be tested against a
 * synthetic one, and reused for JPEG quality, PDF image downsampling and
 * video bitrate alike.
 */

export interface SearchOptions {
  /** Lowest acceptable setting. Below this, output is too degraded to be useful. */
  min?: number;
  /** Highest setting worth trying — usually the original quality. */
  max?: number;
  /** How many encodes to spend. Each one costs real time. */
  maxAttempts?: number;
  /**
   * Stop early once within this fraction under the target: landing at 1.95MB
   * for a 2MB cap is a good answer, and further refinement wastes seconds.
   */
  tolerance?: number;
}

export interface SearchResult<T = number> {
  /** The chosen setting. */
  setting: T;
  /** Size that setting produced, in bytes. */
  bytes: number;
  /** False when even the lowest setting couldn't reach the target. */
  achieved: boolean;
  /** How many encodes were run — surfaced so progress can be honest. */
  attempts: number;
}

/**
 * Finds the highest `setting` whose encoded size fits within `targetBytes`.
 *
 * Assumes size increases with setting, which holds for quality and scale.
 * The relationship isn't smooth, so this is a bisection rather than an
 * interpolation — quality 80 and 81 can produce identical bytes.
 */
export async function findBestSetting(
  encodedSize: (setting: number) => Promise<number>,
  targetBytes: number,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const min = options.min ?? 0.1;
  const max = options.max ?? 1;
  const maxAttempts = options.maxAttempts ?? 8;
  const tolerance = options.tolerance ?? 0.05;

  let attempts = 0;
  const measure = async (setting: number) => {
    attempts++;
    return encodedSize(setting);
  };

  // If the best quality already fits, there's nothing to trade away.
  const bestSize = await measure(max);
  if (bestSize <= targetBytes) {
    return { setting: max, bytes: bestSize, achieved: true, attempts };
  }

  // If even the worst quality overshoots, say so rather than silently
  // returning something that still doesn't fit.
  const worstSize = await measure(min);
  if (worstSize > targetBytes) {
    return { setting: min, bytes: worstSize, achieved: false, attempts };
  }

  let low = min;
  let high = max;
  let best = { setting: min, bytes: worstSize };

  while (attempts < maxAttempts && high - low > 0.01) {
    const mid = (low + high) / 2;
    const size = await measure(mid);

    if (size <= targetBytes) {
      best = { setting: mid, bytes: size };
      // Close enough to the cap that more attempts buy nothing.
      if (size >= targetBytes * (1 - tolerance)) break;
      low = mid;
    } else {
      high = mid;
    }
  }

  return { ...best, achieved: true, attempts };
}

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  k: 1024,
  mb: 1024 * 1024,
  m: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  g: 1024 * 1024 * 1024,
};

/**
 * Reads a size the way a person writes one: "2mb", "500 KB", "1.5 MB",
 * or a bare number (taken as MB, since that's what forms usually mean).
 */
export function parseSize(input: string): number | null {
  const trimmed = input.trim().toLowerCase().replace(/,/g, "");
  if (!trimmed) return null;

  const match = trimmed.match(/^([\d.]+)\s*([a-z]*)$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2] || "mb";
  const multiplier = UNITS[unit];
  if (!multiplier) return null;

  return Math.round(value * multiplier);
}

/** Common caps, offered as one-tap presets. */
export const SIZE_PRESETS: Array<{ label: string; bytes: number; note?: string }> = [
  { label: "100 KB", bytes: 100 * 1024, note: "Photo on many exam forms" },
  { label: "200 KB", bytes: 200 * 1024 },
  { label: "500 KB", bytes: 500 * 1024, note: "Common document limit" },
  { label: "1 MB", bytes: 1024 * 1024 },
  { label: "2 MB", bytes: 2 * 1024 * 1024, note: "Most government portals" },
  { label: "5 MB", bytes: 5 * 1024 * 1024, note: "Email attachments" },
  { label: "10 MB", bytes: 10 * 1024 * 1024 },
];
