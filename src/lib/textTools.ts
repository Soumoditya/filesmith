/**
 * Small text utilities: counting, case conversion, encoding.
 *
 * All pure, all instant, no downloads. The kind of thing people currently
 * paste into a random website that logs everything they type.
 */

export interface TextCounts {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingMinutes: number;
  speakingMinutes: number;
  /** Word to frequency, most common first. */
  topWords: Array<{ word: string; count: number }>;
}

/** Words too common to be interesting in a frequency list. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "for",
  "with", "is", "are", "was", "were", "be", "been", "being", "it", "its", "this",
  "that", "these", "those", "as", "by", "from", "has", "have", "had", "not", "no",
  "so", "up", "out", "we", "you", "they", "he", "she", "i", "my", "our", "their",
]);

export function countText(source: string): TextCounts {
  const trimmed = source.trim();

  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
  // Sentences end at . ! or ? — imperfect around abbreviations, and close
  // enough for a word counter.
  const sentences = trimmed
    ? trimmed.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length
    : 0;

  const frequency = new Map<string, number>();
  for (const raw of words) {
    const word = raw.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "");
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }

  return {
    words: words.length,
    characters: source.length,
    charactersNoSpaces: source.replace(/\s/g, "").length,
    sentences,
    paragraphs: trimmed ? trimmed.split(/\n{2,}/).filter((p) => p.trim()).length : 0,
    lines: source ? source.split("\n").length : 0,
    // 225 words a minute reading, 140 speaking aloud.
    readingMinutes: words.length ? Math.max(1, Math.round(words.length / 225)) : 0,
    speakingMinutes: words.length ? Math.max(1, Math.round(words.length / 140)) : 0,
    topWords: [...frequency.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([word, count]) => ({ word, count })),
  };
}

export type CaseStyle =
  | "upper"
  | "lower"
  | "title"
  | "sentence"
  | "camel"
  | "pascal"
  | "snake"
  | "kebab"
  | "constant"
  | "toggle";

/** Words kept lowercase in a title, unless they lead or follow a colon. */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor",
  "of", "on", "onto", "or", "over", "the", "to", "up", "with", "yet", "via",
]);

/** Splits any casing style into its constituent words. */
function toWords(source: string): string[] {
  return source
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean);
}

const capitalise = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

export function convertCase(source: string, style: CaseStyle): string {
  if (!source) return source;

  switch (style) {
    case "upper":
      return source.toUpperCase();

    case "lower":
      return source.toLowerCase();

    case "toggle":
      return [...source]
        .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
        .join("");

    case "title":
      // Applied per line, so a list of titles all get treated as titles.
      return source
        .split("\n")
        .map((line) => {
          const words = line.split(/(\s+)/);
          let wordIndex = 0;
          return words
            .map((part) => {
              if (/^\s+$/.test(part) || part === "") return part;
              const isFirst = wordIndex === 0;
              wordIndex++;
              const lower = part.toLowerCase();
              const bare = lower.replace(/[^\p{L}]/gu, "");
              if (!isFirst && MINOR_WORDS.has(bare)) return lower;
              return capitalise(part);
            })
            .join("");
        })
        .join("\n");

    case "sentence":
      return source
        .toLowerCase()
        // Capitalise after a full stop, and at the very start.
        .replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());

    case "camel": {
      const words = toWords(source);
      return words
        .map((w, i) => (i === 0 ? w.toLowerCase() : capitalise(w)))
        .join("");
    }

    case "pascal":
      return toWords(source).map(capitalise).join("");

    case "snake":
      return toWords(source).map((w) => w.toLowerCase()).join("_");

    case "kebab":
      return toWords(source).map((w) => w.toLowerCase()).join("-");

    case "constant":
      return toWords(source).map((w) => w.toUpperCase()).join("_");
  }
}

export const CASE_STYLES: Array<{ id: CaseStyle; label: string; example: string }> = [
  { id: "upper", label: "UPPERCASE", example: "HELLO THERE" },
  { id: "lower", label: "lowercase", example: "hello there" },
  { id: "title", label: "Title Case", example: "Hello There" },
  { id: "sentence", label: "Sentence case", example: "Hello there" },
  { id: "camel", label: "camelCase", example: "helloThere" },
  { id: "pascal", label: "PascalCase", example: "HelloThere" },
  { id: "snake", label: "snake_case", example: "hello_there" },
  { id: "kebab", label: "kebab-case", example: "hello-there" },
  { id: "constant", label: "CONSTANT_CASE", example: "HELLO_THERE" },
  { id: "toggle", label: "tOGGLE cASE", example: "hELLO tHERE" },
];

/* ------------------------------------------------------------------ base64 */

/** Encodes text as Base64, handling any Unicode rather than only Latin-1. */
export function encodeBase64(text: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  return urlSafe ? encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : encoded;
}

export function decodeBase64(encoded: string): string {
  // Accept the URL-safe alphabet and restore any stripped padding.
  let normalised = encoded.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  while (normalised.length % 4 !== 0) normalised += "=";

  const binary = atob(normalised);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function looksLikeBase64(value: string): boolean {
  const trimmed = value.trim().replace(/\s/g, "");
  if (trimmed.length < 4) return false;
  return /^[A-Za-z0-9+/\-_]+=*$/.test(trimmed);
}

/* ------------------------------------------------------------------ hashing */

export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export const HASH_ALGORITHMS: Array<{ id: HashAlgorithm; label: string; note: string }> = [
  { id: "SHA-256", label: "SHA-256", note: "The usual choice for checking downloads." },
  { id: "SHA-512", label: "SHA-512", note: "Longer, no more useful for file checks." },
  { id: "SHA-384", label: "SHA-384", note: "" },
  { id: "SHA-1", label: "SHA-1", note: "Still published by some projects, but broken — don't trust it for security." },
];

/** Hashes a file in chunks so a large one doesn't have to fit in memory twice. */
export async function hashFile(
  file: File,
  algorithm: HashAlgorithm,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  // SubtleCrypto has no streaming interface, so the whole buffer is needed.
  // Progress is reported around the read, which is the slow part for big files.
  onProgress?.(0.1);
  const buffer = await file.arrayBuffer();
  onProgress?.(0.6);

  const digest = await crypto.subtle.digest(algorithm, buffer);
  onProgress?.(1);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashText(
  text: string,
  algorithm: HashAlgorithm,
): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
