import type { ComponentType } from "react";

/**
 * The tool catalogue is the spine of the app: it drives routing, the hub
 * pages, search, and the homepage drop zone's "what can I do with this
 * file?" matching.
 *
 * Metadata for every tool ships in the main bundle (it's tiny, and the
 * homepage needs all of it to match dropped files). The tool UI itself is
 * behind `load`, so each tool and its heavy libraries are a separate chunk
 * fetched only when someone opens it.
 */

export type HubId =
  | "documents"
  | "images"
  | "media"
  | "create"
  | "clean"
  | "utilities";

/** Broad category of a file, used to match dropped files to tools. */
export type FileKind =
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "spreadsheet"
  | "archive"
  | "text";

export interface HubDef {
  id: HubId;
  name: string;
  blurb: string;
}

export const HUBS: HubDef[] = [
  {
    id: "documents",
    name: "Documents",
    blurb: "Merge, split, sign, convert and clean up PDFs and Word files.",
  },
  {
    id: "images",
    name: "Images",
    blurb: "Convert, shrink, resize and touch up pictures.",
  },
  {
    id: "media",
    name: "Media",
    blurb: "Convert, trim and compress video and audio.",
  },
  {
    id: "create",
    name: "Create",
    blurb: "Make a polished PDF, a QR code, or a document from scratch.",
  },
  {
    id: "clean",
    name: "Clean",
    blurb: "Remove backgrounds and unwanted objects, using AI on your device.",
  },
  {
    id: "utilities",
    name: "Utilities",
    blurb: "Zip, spreadsheets, encoding and checksums.",
  },
];

export interface ToolDef {
  slug: string;
  name: string;
  hub: HubId;
  /** One plain-English line. No jargon. */
  blurb: string;
  /** Extra search terms people might actually type. */
  keywords?: string[];
  /**
   * File kinds this tool works on. An empty array means the tool takes no
   * file input at all (the QR generator, for instance).
   */
  accepts: FileKind[];
  /** Narrower than `accepts` when a tool only handles specific extensions. */
  extensions?: string[];
  /** Whether the tool operates on a batch. */
  multiple?: boolean;
  /** `soon` tools are listed but not linked — honest, not vapourware. */
  status: "ready" | "soon";
  load?: () => Promise<{ default: ComponentType }>;
}

export const TOOLS: ToolDef[] = [
  // ---------------------------------------------------------------- Documents
  {
    slug: "merge-pdf",
    name: "Merge PDF",
    hub: "documents",
    blurb: "Join several PDFs into one file, in any order you like.",
    keywords: ["combine", "join", "append", "concat"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/MergePdf"),
  },
  {
    slug: "split-pdf",
    name: "Split PDF",
    hub: "documents",
    blurb: "Pull out single pages or break one PDF into several.",
    keywords: ["extract pages", "separate", "divide"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },
  {
    slug: "organise-pdf",
    name: "Organise pages",
    hub: "documents",
    blurb: "Reorder, rotate and delete pages on a visual page grid.",
    keywords: ["reorder", "rotate", "delete pages", "rearrange"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },
  {
    slug: "compress-pdf",
    name: "Compress PDF",
    hub: "documents",
    blurb: "Make a PDF smaller so it fits an upload limit.",
    keywords: ["shrink", "reduce size", "optimise"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "pdf-to-image",
    name: "PDF to JPG",
    hub: "documents",
    blurb: "Turn every page of a PDF into a picture.",
    keywords: ["png", "jpeg", "export pages", "screenshot"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },
  {
    slug: "image-to-pdf",
    name: "Images to PDF",
    hub: "documents",
    blurb: "Put your photos or scans into a single PDF.",
    keywords: ["jpg to pdf", "png to pdf", "scan"],
    accepts: ["image"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "page-numbers",
    name: "Add page numbers",
    hub: "documents",
    blurb: "Number the pages, with headers and footers if you want them.",
    keywords: ["footer", "header", "numbering"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },
  {
    slug: "watermark-pdf",
    name: "Watermark PDF",
    hub: "documents",
    blurb: "Stamp text or a logo across every page.",
    keywords: ["stamp", "draft", "confidential", "logo"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "sign-pdf",
    name: "Sign PDF",
    hub: "documents",
    blurb: "Draw, type or upload a signature and place it on the page.",
    keywords: ["signature", "e-sign", "initials"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },
  {
    slug: "fill-forms",
    name: "Fill PDF forms",
    hub: "documents",
    blurb: "Fill in a form and lock the answers so they can't be changed.",
    keywords: ["form", "flatten", "acroform"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },
  {
    slug: "protect-pdf",
    name: "Password protect",
    hub: "documents",
    blurb: "Lock a PDF with a password.",
    keywords: ["encrypt", "lock", "secure"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "unlock-pdf",
    name: "Remove password",
    hub: "documents",
    blurb: "Take the password off a PDF you can already open.",
    keywords: ["decrypt", "unlock"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },
  {
    slug: "redact-pdf",
    name: "Redact PDF",
    hub: "documents",
    blurb: "Black out private details so they're really gone, not just hidden.",
    keywords: ["black out", "censor", "hide", "private"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },
  {
    slug: "ocr-pdf",
    name: "Make a scan searchable",
    hub: "documents",
    blurb: "Read the text in a scanned PDF so you can search and copy it.",
    keywords: ["ocr", "scan", "recognise text", "searchable"],
    accepts: ["pdf", "image"],
    status: "soon",
  },
  {
    slug: "pdf-to-word",
    name: "PDF to Word",
    hub: "documents",
    blurb: "Turn a PDF into an editable .docx document.",
    keywords: ["docx", "convert", "editable"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },
  {
    slug: "word-to-pdf",
    name: "Word to PDF",
    hub: "documents",
    blurb: "Turn a .docx into a PDF anyone can open.",
    keywords: ["docx", "doc", "convert"],
    accepts: ["document"],
    extensions: ["docx"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "pdf-to-text",
    name: "PDF to text",
    hub: "documents",
    blurb: "Pull the plain text or Markdown out of a PDF.",
    keywords: ["extract text", "markdown", "copy"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },
  {
    slug: "edit-pdf-text",
    name: "Edit PDF text",
    hub: "documents",
    blurb: "Cover up wrong text and type the right text over it.",
    keywords: ["change text", "fix typo", "whiteout"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "soon",
  },

  // ------------------------------------------------------------------- Images
  {
    slug: "convert-image",
    name: "Convert image",
    hub: "images",
    blurb: "Change between JPG, PNG, WebP, AVIF, HEIC and more.",
    keywords: ["jpg", "png", "webp", "avif", "heic", "format"],
    accepts: ["image"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "compress-image",
    name: "Compress image",
    hub: "images",
    blurb: "Shrink a photo with a live before-and-after view.",
    keywords: ["reduce size", "optimise", "smaller"],
    accepts: ["image"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "resize-image",
    name: "Resize image",
    hub: "images",
    blurb: "Set an exact width and height, or scale by percentage.",
    keywords: ["scale", "dimensions", "width", "height"],
    accepts: ["image"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "crop-image",
    name: "Crop image",
    hub: "images",
    blurb: "Trim a picture down, freehand or to a set aspect ratio.",
    keywords: ["trim", "cut", "aspect ratio"],
    accepts: ["image"],
    status: "soon",
  },
  {
    slug: "rotate-image",
    name: "Rotate & flip",
    hub: "images",
    blurb: "Turn a sideways photo the right way up.",
    keywords: ["turn", "mirror", "straighten", "orientation"],
    accepts: ["image"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "watermark-image",
    name: "Watermark images",
    hub: "images",
    blurb: "Add your text or logo to a whole batch of photos.",
    keywords: ["logo", "brand", "stamp", "copyright"],
    accepts: ["image"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "favicon-generator",
    name: "Favicon generator",
    hub: "images",
    blurb: "One picture in, a complete set of website icons out.",
    keywords: ["icon", "app icon", "manifest", "apple touch"],
    accepts: ["image"],
    status: "soon",
  },
  {
    slug: "palette-extractor",
    name: "Get colours from an image",
    hub: "images",
    blurb: "Pull the main colours out of a picture as hex codes.",
    keywords: ["colour", "color", "palette", "hex", "swatch"],
    accepts: ["image"],
    status: "soon",
  },

  // -------------------------------------------------------------------- Media
  {
    slug: "convert-video",
    name: "Convert video",
    hub: "media",
    blurb: "Change a video between MP4, WebM, MKV and MOV.",
    keywords: ["mp4", "webm", "mkv", "mov", "format"],
    accepts: ["video"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "convert-audio",
    name: "Convert audio",
    hub: "media",
    blurb: "Change a sound file between MP3, WAV, OGG, FLAC and M4A.",
    keywords: ["mp3", "wav", "ogg", "flac", "m4a", "format"],
    accepts: ["audio"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "extract-audio",
    name: "Get the audio from a video",
    hub: "media",
    blurb: "Save just the sound from a video file.",
    keywords: ["rip audio", "mp3 from video", "soundtrack"],
    accepts: ["video"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "trim-media",
    name: "Trim video or audio",
    hub: "media",
    blurb: "Keep the part you want and cut off the rest.",
    keywords: ["cut", "clip", "shorten", "crop"],
    accepts: ["video", "audio"],
    status: "soon",
  },
  {
    slug: "compress-video",
    name: "Compress video",
    hub: "media",
    blurb: "Make a video smaller, or drop it to a lower resolution.",
    keywords: ["shrink", "reduce size", "720p", "1080p"],
    accepts: ["video"],
    status: "soon",
  },
  {
    slug: "mute-video",
    name: "Mute a video",
    hub: "media",
    blurb: "Strip the sound out and keep the picture.",
    keywords: ["remove audio", "silent", "no sound"],
    accepts: ["video"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "video-to-gif",
    name: "Video to GIF",
    hub: "media",
    blurb: "Turn a short clip into an animated GIF.",
    keywords: ["gif", "animation", "loop"],
    accepts: ["video"],
    status: "soon",
  },
  {
    slug: "media-info",
    name: "Media details",
    hub: "media",
    blurb: "See the codec, resolution, bitrate and length of a file.",
    keywords: ["metadata", "codec", "resolution", "bitrate", "info"],
    accepts: ["video", "audio"],
    multiple: true,
    status: "soon",
  },

  // ------------------------------------------------------------------- Create
  {
    slug: "text-to-pdf",
    name: "Text to PDF",
    hub: "create",
    blurb: "Write or paste text and get a properly typeset PDF.",
    keywords: ["write", "markdown", "document", "typeset", "letter", "report"],
    accepts: ["text"],
    status: "soon",
  },
  {
    slug: "qr-generator",
    name: "QR code generator",
    hub: "create",
    blurb: "Make a QR code for a link, WiFi, contact card or plain text.",
    keywords: ["qr", "barcode", "wifi", "vcard", "link", "scan"],
    accepts: [],
    status: "ready",
    load: () => import("../tools/QrGenerator"),
  },
  {
    slug: "qr-reader",
    name: "Read a QR code",
    hub: "create",
    blurb: "Point your camera at a code, or upload a picture of one.",
    keywords: ["scan", "decode", "camera"],
    accepts: ["image"],
    status: "soon",
  },
  {
    slug: "barcode-generator",
    name: "Barcode generator",
    hub: "create",
    blurb: "Make EAN, UPC and Code 128 barcodes.",
    keywords: ["ean", "upc", "code128", "product"],
    accepts: [],
    status: "soon",
  },
  {
    slug: "invoice-maker",
    name: "Invoice maker",
    hub: "create",
    blurb: "Fill in a simple form and get a clean invoice PDF.",
    keywords: ["bill", "receipt", "quote", "gst"],
    accepts: [],
    status: "soon",
  },
  {
    slug: "resume-maker",
    name: "Resume maker",
    hub: "create",
    blurb: "Build a tidy one-page CV and export it as a PDF.",
    keywords: ["cv", "curriculum vitae", "job"],
    accepts: [],
    status: "soon",
  },

  // -------------------------------------------------------------------- Clean
  {
    slug: "remove-background",
    name: "Remove background",
    hub: "clean",
    blurb: "Cut the subject out of a photo and get a transparent PNG.",
    keywords: ["cutout", "transparent", "bg remove", "isolate"],
    accepts: ["image"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "remove-object",
    name: "Remove an object",
    hub: "clean",
    blurb: "Brush over something you don't want and let AI fill it in.",
    keywords: ["watermark", "inpaint", "erase", "delete object", "cleanup"],
    accepts: ["image"],
    status: "soon",
  },

  // ---------------------------------------------------------------- Utilities
  {
    slug: "zip-files",
    name: "Make a ZIP",
    hub: "utilities",
    blurb: "Bundle any files into one .zip.",
    keywords: ["archive", "compress", "bundle"],
    accepts: ["pdf", "image", "video", "audio", "document", "spreadsheet", "text", "archive"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "unzip-files",
    name: "Open a ZIP",
    hub: "utilities",
    blurb: "Look inside a .zip and pull out what you need.",
    keywords: ["extract", "unarchive", "open"],
    accepts: ["archive"],
    status: "soon",
  },
  {
    slug: "convert-spreadsheet",
    name: "Convert spreadsheet",
    hub: "utilities",
    blurb: "Move data between Excel, CSV and JSON.",
    keywords: ["xlsx", "csv", "json", "excel", "data"],
    accepts: ["spreadsheet"],
    multiple: true,
    status: "soon",
  },
  {
    slug: "base64",
    name: "Base64 encode / decode",
    hub: "utilities",
    blurb: "Turn a file or text into Base64 and back again.",
    keywords: ["encode", "decode", "data uri"],
    accepts: [],
    status: "soon",
  },
  {
    slug: "hash",
    name: "Checksum a file",
    hub: "utilities",
    blurb: "Get the SHA-256 or MD5 of a file to check it downloaded intact.",
    keywords: ["sha256", "md5", "checksum", "verify", "integrity"],
    accepts: ["pdf", "image", "video", "audio", "document", "spreadsheet", "text", "archive"],
    multiple: true,
    status: "soon",
  },
];

export const READY_TOOLS = TOOLS.filter((t) => t.status === "ready");

export function getTool(slug: string): ToolDef | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function toolsInHub(hub: HubId): ToolDef[] {
  return TOOLS.filter((t) => t.hub === hub);
}

/** Tools that can do something with a file of this kind, ready ones first. */
export function toolsForKind(kind: FileKind, ext: string): ToolDef[] {
  return TOOLS.filter((t) => {
    if (!t.accepts.includes(kind)) return false;
    if (t.extensions && !t.extensions.includes(ext)) return false;
    return true;
  }).sort((a, b) => Number(b.status === "ready") - Number(a.status === "ready"));
}

/** Simple substring scoring across name, blurb and keywords. */
export function searchTools(query: string): ToolDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ tool: ToolDef; score: number }> = [];

  for (const tool of TOOLS) {
    const name = tool.name.toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (tool.keywords?.some((k) => k.includes(q))) score = 40;
    else if (tool.blurb.toLowerCase().includes(q)) score = 20;

    if (score > 0) {
      if (tool.status === "ready") score += 10;
      scored.push({ tool, score });
    }
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.tool);
}
