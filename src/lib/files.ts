import type { FileKind } from "./registry";

/** Extension -> broad kind. Extension wins over MIME because browsers lie
 *  about MIME for plenty of formats (HEIC, MKV, and anything unusual). */
const EXTENSION_KINDS: Record<string, FileKind> = {
  pdf: "pdf",

  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  heic: "image",
  heif: "image",
  svg: "image",
  ico: "image",

  mp4: "video",
  m4v: "video",
  mov: "video",
  webm: "video",
  mkv: "video",
  avi: "video",
  wmv: "video",
  flv: "video",
  mpg: "video",
  mpeg: "video",
  "3gp": "video",
  ts: "video",

  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  oga: "audio",
  flac: "audio",
  m4a: "audio",
  aac: "audio",
  opus: "audio",
  wma: "audio",
  aiff: "audio",

  doc: "document",
  docx: "document",
  odt: "document",
  rtf: "document",
  pages: "document",

  xls: "spreadsheet",
  xlsx: "spreadsheet",
  ods: "spreadsheet",
  csv: "spreadsheet",
  tsv: "spreadsheet",

  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",

  txt: "text",
  md: "text",
  markdown: "text",
  json: "text",
  xml: "text",
  html: "text",
  yml: "text",
  yaml: "text",
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

export function baseNameOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 1 ? filename : filename.slice(0, dot);
}

/** Best guess at what kind of file this is. Falls back to MIME. */
export function kindOf(file: File): FileKind | null {
  const byExt = EXTENSION_KINDS[extensionOf(file.name)];
  if (byExt) return byExt;

  const mime = file.type;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("text/")) return "text";
  if (mime === "application/pdf") return "pdf";

  return null;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / Math.pow(1024, i);
  // Whole numbers for bytes and KB read better without a decimal point.
  const places = i < 2 ? 0 : decimals;
  return `${value.toFixed(places)} ${UNITS[i]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Hand a Blob to the user as a download.
 *
 * The object URL is revoked on the next tick rather than immediately —
 * Safari aborts the download if the URL dies in the same frame as the click.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Bundle several outputs into a single .zip. Loaded on demand. */
export async function saveAllAsZip(
  files: Array<{ name: string; blob: Blob }>,
  zipName: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  // Two files with the same name would silently overwrite each other.
  const used = new Set<string>();
  for (const { name, blob } of files) {
    let unique = name;
    let n = 2;
    while (used.has(unique)) {
      unique = `${baseNameOf(name)} (${n}).${extensionOf(name)}`;
      n++;
    }
    used.add(unique);
    zip.file(unique, blob);
  }

  const out = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => onProgress?.(meta.percent),
  );
  saveBlob(out, zipName);
}

/** Swap a filename's extension, keeping the base name. */
export function withExtension(filename: string, ext: string): string {
  return `${baseNameOf(filename)}.${ext.replace(/^\./, "")}`;
}
