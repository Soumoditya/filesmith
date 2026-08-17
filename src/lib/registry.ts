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
 *
 * Hubs are ordered by real-world demand, and each is split into sections so
 * an eighteen-item category stops being a wall of links.
 */

export type HubId =
  | "documents"
  | "images"
  | "create"
  | "media"
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
  /** Section headings, in display order. Empty means a flat list. */
  sections: string[];
}

export const HUBS: HubDef[] = [
  {
    id: "documents",
    name: "Documents",
    blurb: "Merge, split, sign, convert and clean up PDFs and Word files.",
    sections: ["Organise", "Convert", "Edit", "Secure", "Improve"],
  },
  {
    id: "images",
    name: "Images",
    blurb: "Convert, shrink, resize and touch up pictures.",
    sections: ["Convert & compress", "Resize & crop", "Edit", "Generate"],
  },
  {
    id: "create",
    name: "Create",
    blurb: "Build a resume, an invoice, a letter or a QR code from scratch.",
    sections: ["Documents", "Codes"],
  },
  {
    id: "media",
    name: "Media",
    blurb: "Convert, trim and compress video and audio.",
    sections: ["Convert", "Edit", "Inspect"],
  },
  {
    id: "clean",
    name: "Clean",
    blurb: "Remove backgrounds and unwanted objects, using AI on your device.",
    sections: [],
  },
  {
    id: "utilities",
    name: "Utilities",
    blurb: "Zip, spreadsheets, text counts, encoding and checksums.",
    sections: [],
  },
];

export interface ToolDef {
  slug: string;
  name: string;
  hub: HubId;
  /** Must match one of the hub's sections, when it has any. */
  section?: string;
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
  /** Surfaces in the homepage "Most used" row. */
  popular?: boolean;
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
    section: "Organise",
    blurb: "Join several PDFs into one file, in any order you like.",
    keywords: ["combine", "join", "append", "concat"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    multiple: true,
    popular: true,
    status: "ready",
    load: () => import("../tools/MergePdf"),
  },
  {
    slug: "split-pdf",
    name: "Split PDF",
    hub: "documents",
    section: "Organise",
    blurb: "Pull out single pages or break one PDF into several.",
    keywords: ["extract pages", "separate", "divide"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    popular: true,
    status: "ready",
    load: () => import("../tools/SplitPdf"),
  },
  {
    slug: "organise-pdf",
    name: "Organise pages",
    hub: "documents",
    section: "Organise",
    blurb: "Reorder, rotate and delete pages on a visual page grid.",
    keywords: ["reorder", "rotate", "delete pages", "rearrange"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    popular: true,
    status: "ready",
    load: () => import("../tools/OrganisePdf"),
  },
  {
    slug: "compress-pdf",
    name: "Compress PDF",
    hub: "documents",
    section: "Improve",
    blurb: "Make a PDF smaller so it fits an upload limit.",
    keywords: ["shrink", "reduce size", "optimise"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    multiple: true,
    popular: true,
    status: "ready",
    load: () => import("../tools/CompressPdf"),
  },
  {
    slug: "compress-to-size",
    name: "Fit under a size limit",
    hub: "documents",
    section: "Improve",
    blurb: "Squeeze a file until it slips under the limit a form demands.",
    keywords: ["under 2mb", "500kb", "upload limit", "form", "exam", "target size"],
    accepts: ["pdf", "image"],
    multiple: true,
    popular: true,
    status: "ready",
    load: () => import("../tools/FitUnderSize"),
  },
  {
    slug: "pdf-to-image",
    name: "PDF to JPG",
    hub: "documents",
    section: "Convert",
    blurb: "Turn every page of a PDF into a picture.",
    keywords: ["png", "jpeg", "export pages", "screenshot"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    popular: true,
    status: "ready",
    load: () => import("../tools/PdfToImages"),
  },
  {
    slug: "image-to-pdf",
    name: "Images to PDF",
    hub: "documents",
    section: "Convert",
    blurb: "Put your photos or scans into a single PDF.",
    keywords: ["jpg to pdf", "png to pdf", "scan"],
    accepts: ["image"],
    multiple: true,
    popular: true,
    status: "ready",
    load: () => import("../tools/ImagesToPdf"),
  },
  {
    slug: "page-numbers",
    name: "Add page numbers",
    hub: "documents",
    section: "Edit",
    blurb: "Number the pages, with headers and footers if you want them.",
    keywords: ["footer", "header", "numbering"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "ready",
    load: () => import("../tools/PageNumbers"),
  },
  {
    slug: "watermark-pdf",
    name: "Watermark PDF",
    hub: "documents",
    section: "Edit",
    blurb: "Stamp text or a logo across every page.",
    keywords: ["stamp", "draft", "confidential", "logo"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/WatermarkPdf"),
  },
  {
    slug: "sign-pdf",
    name: "Sign PDF",
    hub: "documents",
    section: "Edit",
    blurb: "Draw, type or upload a signature and place it on the page.",
    keywords: ["signature", "e-sign", "initials"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    popular: true,
    status: "ready",
    load: () => import("../tools/SignPdf"),
  },
  {
    slug: "fill-forms",
    name: "Fill PDF forms",
    hub: "documents",
    section: "Edit",
    blurb: "Fill in a form and lock the answers so they can't be changed.",
    keywords: ["form", "flatten", "acroform"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "ready",
    load: () => import("../tools/FillForms"),
  },
  {
    slug: "edit-pdf-text",
    name: "Edit PDF text",
    hub: "documents",
    section: "Edit",
    blurb: "Cover up wrong text and type the right text over it.",
    keywords: ["change text", "fix typo", "whiteout"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "ready",
    load: () => import("../tools/EditPdfText"),
  },
  {
    slug: "protect-pdf",
    name: "Password protect",
    hub: "documents",
    section: "Secure",
    blurb: "Lock a PDF with a password.",
    keywords: ["encrypt", "lock", "secure"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/ProtectPdf"),
  },
  {
    slug: "unlock-pdf",
    name: "Remove password",
    hub: "documents",
    section: "Secure",
    blurb: "Take the password off a PDF you can already open.",
    keywords: ["decrypt", "unlock"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "ready",
    load: () => import("../tools/UnlockPdf"),
  },
  {
    slug: "redact-pdf",
    name: "Redact PDF",
    hub: "documents",
    section: "Secure",
    blurb: "Black out private details so they're really gone, not just hidden.",
    keywords: ["black out", "censor", "hide", "private"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "ready",
    load: () => import("../tools/RedactPdf"),
  },
  {
    slug: "ocr-pdf",
    name: "Make a scan searchable",
    hub: "documents",
    section: "Improve",
    blurb: "Read the text in a scanned PDF so you can search and copy it.",
    keywords: ["ocr", "scan", "recognise text", "searchable"],
    accepts: ["pdf", "image"],
    status: "soon",
  },
  {
    slug: "pdf-to-word",
    name: "PDF to Word",
    hub: "documents",
    section: "Convert",
    blurb: "Turn a PDF into an editable .docx document.",
    keywords: ["docx", "convert", "editable"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    popular: true,
    status: "ready",
    load: () => import("../tools/PdfToWord"),
  },
  {
    slug: "word-to-pdf",
    name: "Word to PDF",
    hub: "documents",
    section: "Convert",
    blurb: "Turn a .docx into a PDF anyone can open.",
    keywords: ["docx", "doc", "convert"],
    accepts: ["document"],
    extensions: ["docx"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/WordToPdf"),
  },
  {
    slug: "pdf-to-text",
    name: "PDF to text",
    hub: "documents",
    section: "Convert",
    blurb: "Pull the plain text or Markdown out of a PDF.",
    keywords: ["extract text", "markdown", "copy"],
    accepts: ["pdf"],
    extensions: ["pdf"],
    status: "ready",
    load: () => import("../tools/PdfToText"),
  },

  // ------------------------------------------------------------------- Images
  {
    slug: "convert-image",
    name: "Convert image",
    hub: "images",
    section: "Convert & compress",
    blurb: "Change between JPG, PNG, WebP, AVIF, HEIC and more.",
    keywords: ["jpg", "png", "webp", "avif", "heic", "format"],
    accepts: ["image"],
    multiple: true,
    popular: true,
    status: "ready",
    load: () => import("../tools/ConvertImage"),
  },
  {
    slug: "compress-image",
    name: "Compress image",
    hub: "images",
    section: "Convert & compress",
    blurb: "Shrink a photo with a live before-and-after view.",
    keywords: ["reduce size", "optimise", "smaller"],
    accepts: ["image"],
    multiple: true,
    popular: true,
    status: "ready",
    load: () => import("../tools/CompressImage"),
  },
  {
    slug: "resize-image",
    name: "Resize image",
    hub: "images",
    section: "Resize & crop",
    blurb: "Set an exact width and height, or scale by percentage.",
    keywords: ["scale", "dimensions", "width", "height"],
    accepts: ["image"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/ResizeImage"),
  },
  {
    slug: "crop-image",
    name: "Crop image",
    hub: "images",
    section: "Resize & crop",
    blurb: "Trim a picture down, freehand or to a set aspect ratio.",
    keywords: ["trim", "cut", "aspect ratio"],
    accepts: ["image"],
    status: "soon",
  },
  {
    slug: "rotate-image",
    name: "Rotate & flip",
    hub: "images",
    section: "Resize & crop",
    blurb: "Turn a sideways photo the right way up.",
    keywords: ["turn", "mirror", "straighten", "orientation"],
    accepts: ["image"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/RotateImage"),
  },
  {
    slug: "watermark-image",
    name: "Watermark images",
    hub: "images",
    section: "Edit",
    blurb: "Add your text or logo to a whole batch of photos.",
    keywords: ["logo", "brand", "stamp", "copyright"],
    accepts: ["image"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/WatermarkImage"),
  },
  {
    slug: "passport-photo",
    name: "Passport photo",
    hub: "images",
    section: "Generate",
    blurb: "Crop a photo to passport size and lay out a sheet to print.",
    keywords: ["id photo", "visa", "35x45", "2x2", "print sheet"],
    accepts: ["image"],
    popular: true,
    status: "ready",
    load: () => import("../tools/PassportPhoto"),
  },
  {
    slug: "favicon-generator",
    name: "Favicon generator",
    hub: "images",
    section: "Generate",
    blurb: "One picture in, a complete set of website icons out.",
    keywords: ["icon", "app icon", "manifest", "apple touch"],
    accepts: ["image"],
    status: "ready",
    load: () => import("../tools/FaviconGenerator"),
  },
  {
    slug: "palette-extractor",
    name: "Get colours from an image",
    hub: "images",
    section: "Generate",
    blurb: "Pull the main colours out of a picture as hex codes.",
    keywords: ["colour", "color", "palette", "hex", "swatch"],
    accepts: ["image"],
    status: "ready",
    load: () => import("../tools/PaletteExtractor"),
  },

  // ------------------------------------------------------------------- Create
  {
    slug: "resume-maker",
    name: "Resume builder",
    hub: "create",
    section: "Documents",
    blurb: "Build a CV that gets past the robots, and export it as PDF or Word.",
    keywords: ["cv", "curriculum vitae", "job", "ats", "biodata", "template"],
    accepts: [],
    popular: true,
    status: "ready",
    load: () => import("../tools/ResumeBuilder"),
  },
  {
    slug: "invoice-maker",
    name: "Invoice maker",
    hub: "create",
    section: "Documents",
    blurb: "Make a proper invoice, with GST worked out for you.",
    keywords: ["bill", "gst", "tax invoice", "freelance", "billing"],
    accepts: [],
    popular: true,
    status: "soon",
  },
  {
    slug: "quotation-maker",
    name: "Quotation",
    hub: "create",
    section: "Documents",
    blurb: "Send a priced quote or estimate before the work starts.",
    keywords: ["quote", "estimate", "proposal"],
    accepts: [],
    status: "soon",
  },
  {
    slug: "receipt-maker",
    name: "Receipt",
    hub: "create",
    section: "Documents",
    blurb: "Give someone proof that they've paid.",
    keywords: ["payment", "proof", "acknowledgement"],
    accepts: [],
    status: "soon",
  },
  {
    slug: "text-to-pdf",
    name: "Text to PDF",
    hub: "create",
    section: "Documents",
    blurb: "Write or paste text and get a properly typeset PDF.",
    keywords: ["write", "markdown", "document", "typeset", "report"],
    accepts: ["text"],
    popular: true,
    status: "soon",
  },
  {
    slug: "letter-writer",
    name: "Letter",
    hub: "create",
    section: "Documents",
    blurb: "Write a formal letter or covering letter on a proper layout.",
    keywords: ["cover letter", "formal", "application", "resignation"],
    accepts: [],
    status: "soon",
  },
  {
    slug: "qr-generator",
    name: "QR code generator",
    hub: "create",
    section: "Codes",
    blurb: "Make a QR code for a link, WiFi, contact card or plain text.",
    keywords: ["qr", "barcode", "wifi", "vcard", "link", "scan"],
    accepts: [],
    popular: true,
    status: "ready",
    load: () => import("../tools/QrGenerator"),
  },
  {
    slug: "qr-reader",
    name: "Read a QR code",
    hub: "create",
    section: "Codes",
    blurb: "Point your camera at a code, or upload a picture of one.",
    keywords: ["scan", "decode", "camera"],
    accepts: ["image"],
    status: "soon",
  },
  {
    slug: "barcode-generator",
    name: "Barcode generator",
    hub: "create",
    section: "Codes",
    blurb: "Make EAN, UPC and Code 128 barcodes.",
    keywords: ["ean", "upc", "code128", "product"],
    accepts: [],
    status: "soon",
  },

  // -------------------------------------------------------------------- Media
  {
    slug: "convert-video",
    name: "Convert video",
    hub: "media",
    section: "Convert",
    blurb: "Change a video between MP4, WebM, MKV and MOV.",
    keywords: ["mp4", "webm", "mkv", "mov", "format"],
    accepts: ["video"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/ConvertVideo"),
  },
  {
    slug: "convert-audio",
    name: "Convert audio",
    hub: "media",
    section: "Convert",
    blurb: "Change a sound file between MP3, WAV, OGG, FLAC and M4A.",
    keywords: ["mp3", "wav", "ogg", "flac", "m4a", "format"],
    accepts: ["audio"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/ConvertAudio"),
  },
  {
    slug: "extract-audio",
    name: "Get the audio from a video",
    hub: "media",
    section: "Convert",
    blurb: "Save just the sound from a video file.",
    keywords: ["rip audio", "mp3 from video", "soundtrack"],
    accepts: ["video"],
    multiple: true,
    popular: true,
    status: "ready",
    load: () => import("../tools/ExtractAudio"),
  },
  {
    slug: "video-to-gif",
    name: "Video to GIF",
    hub: "media",
    section: "Convert",
    blurb: "Turn a short clip into an animated GIF.",
    keywords: ["gif", "animation", "loop"],
    accepts: ["video"],
    status: "ready",
    load: () => import("../tools/VideoToGif"),
  },
  {
    slug: "trim-media",
    name: "Trim video or audio",
    hub: "media",
    section: "Edit",
    blurb: "Keep the part you want and cut off the rest.",
    keywords: ["cut", "clip", "shorten", "crop"],
    accepts: ["video", "audio"],
    status: "ready",
    load: () => import("../tools/TrimMedia"),
  },
  {
    slug: "compress-video",
    name: "Compress video",
    hub: "media",
    section: "Edit",
    blurb: "Make a video smaller, or drop it to a lower resolution.",
    keywords: ["shrink", "reduce size", "720p", "1080p"],
    accepts: ["video"],
    status: "ready",
    load: () => import("../tools/CompressVideo"),
  },
  {
    slug: "mute-video",
    name: "Mute a video",
    hub: "media",
    section: "Edit",
    blurb: "Strip the sound out and keep the picture.",
    keywords: ["remove audio", "silent", "no sound"],
    accepts: ["video"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/MuteVideo"),
  },
  {
    slug: "media-info",
    name: "Media details",
    hub: "media",
    section: "Inspect",
    blurb: "See the codec, resolution, bitrate and length of a file.",
    keywords: ["metadata", "codec", "resolution", "bitrate", "info"],
    accepts: ["video", "audio"],
    multiple: true,
    status: "ready",
    load: () => import("../tools/MediaInfo"),
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
    popular: true,
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
    slug: "word-count",
    name: "Count words",
    hub: "utilities",
    blurb: "Words, characters and reading time for any text.",
    keywords: ["character count", "reading time", "essay", "limit"],
    accepts: ["text"],
    status: "soon",
  },
  {
    slug: "case-converter",
    name: "Change text case",
    hub: "utilities",
    blurb: "UPPERCASE, lowercase, Title Case and back again.",
    keywords: ["uppercase", "lowercase", "title case", "sentence case"],
    accepts: ["text"],
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

/** Tools grouped under their hub's section headings, in display order. */
export function sectionsInHub(hub: HubId): Array<{ name: string; tools: ToolDef[] }> {
  const def = HUBS.find((h) => h.id === hub);
  const tools = toolsInHub(hub);
  if (!def || def.sections.length === 0) return [{ name: "", tools }];

  const groups = def.sections.map((name) => ({
    name,
    tools: tools.filter((t) => t.section === name),
  }));

  // Anything without a matching section still has to appear somewhere.
  const orphans = tools.filter((t) => !t.section || !def.sections.includes(t.section));
  if (orphans.length > 0) groups.push({ name: "More", tools: orphans });

  return groups.filter((g) => g.tools.length > 0);
}

/** The homepage's "Most used" row: popular tools, working ones first. */
export function popularTools(limit = 8): ToolDef[] {
  return TOOLS.filter((t) => t.popular)
    .sort((a, b) => Number(b.status === "ready") - Number(a.status === "ready"))
    .slice(0, limit);
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
      if (tool.popular) score += 5;
      scored.push({ tool, score });
    }
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.tool);
}
