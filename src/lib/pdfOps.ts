import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "@cantoo/pdf-lib";

/**
 * Every PDF-writing operation, as plain async functions.
 *
 * These are kept free of any worker plumbing so they can be tested directly
 * in Node — `workers/pdf.worker.ts` is only a thin Comlink shim over them.
 *
 * Reading and rendering live in `pdfRender.ts` (pdf.js). The split is
 * deliberate: pdf.js reads and draws, pdf-lib edits and saves.
 */

export type ProgressFn = (done: number, total: number) => void;

/** A byte source. Files are preferred at runtime; tests pass buffers. */
export type PdfSource = File | ArrayBuffer | Uint8Array;

export interface PageOp {
  /** 1-based page number in the *original* document. */
  source: number;
  /** Extra rotation to apply, in degrees: 0, 90, 180 or 270. */
  rotate: number;
}

export type Corner =
  | "top-left"
  | "top-centre"
  | "top-right"
  | "bottom-left"
  | "bottom-centre"
  | "bottom-right";

export interface PageNumberOptions {
  position: Corner;
  /** The number printed on the first numbered page. */
  startAt: number;
  /** Pages to leave unnumbered (1-based), e.g. a cover. */
  skipPages: number[];
  fontSize: number;
  margin: number;
  /** `{n}` and `{total}` are substituted. */
  format: string;
}

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  opacity: number;
  /** Degrees anticlockwise. */
  angle: number;
  colour: { r: number; g: number; b: number };
  tile: boolean;
}

export interface ImagesToPdfOptions {
  pageSize: "fit" | "a4" | "letter";
  orientation: "auto" | "portrait" | "landscape";
  margin: number;
}

export interface ProtectOptions {
  userPassword: string;
  ownerPassword?: string;
  allowPrinting: boolean;
  allowCopying: boolean;
}

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;

async function bytesOf(source: PdfSource): Promise<ArrayBuffer | Uint8Array> {
  return source instanceof ArrayBuffer || source instanceof Uint8Array
    ? source
    : await source.arrayBuffer();
}

/** `ignoreEncryption` opens PDFs carrying an owner password but no user
 *  password — very common for bank and government documents. */
async function load(source: PdfSource, password?: string): Promise<PDFDocument> {
  return PDFDocument.load(await bytesOf(source), {
    ignoreEncryption: true,
    password,
  });
}

async function finish(doc: PDFDocument): Promise<Uint8Array> {
  doc.setProducer("Filesmith");
  doc.setCreator("Filesmith");
  return doc.save();
}

/**
 * Decodes any image the browser understands into something pdf-lib can
 * embed. JPEG and PNG go in untouched; everything else (WebP, AVIF, and HEIC
 * where supported) is re-encoded through OffscreenCanvas.
 */
async function embedImage(doc: PDFDocument, file: File): Promise<PDFImage> {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 8));

  const isJpeg = head[0] === 0xff && head[1] === 0xd8;
  const isPng =
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;

  if (isJpeg) return doc.embedJpg(buffer);
  if (isPng) return doc.embedPng(buffer);

  const bitmap = await createImageBitmap(new Blob([buffer], { type: file.type }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't decode this image.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const png = await canvas.convertToBlob({ type: "image/png" });
  return doc.embedPng(await png.arrayBuffer());
}

export async function pageCount(source: PdfSource): Promise<number> {
  return (await load(source)).getPageCount();
}

export async function merge(
  sources: PdfSource[],
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();

  for (let i = 0; i < sources.length; i++) {
    const src = await load(sources[i]);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
    onProgress?.(i + 1, sources.length);
  }

  return finish(out);
}

/** One PDF containing the given 1-based pages, in the order given. */
export async function extractPages(
  source: PdfSource,
  pages: number[],
): Promise<Uint8Array> {
  const src = await load(source);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    pages.map((p) => p - 1),
  );
  for (const page of copied) out.addPage(page);
  return finish(out);
}

/** One output document per group of 1-based page numbers. */
export async function splitPages(
  source: PdfSource,
  groups: number[][],
  onProgress?: ProgressFn,
): Promise<Uint8Array[]> {
  const src = await load(source);
  const results: Uint8Array[] = [];

  for (let i = 0; i < groups.length; i++) {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(
      src,
      groups[i].map((p) => p - 1),
    );
    for (const page of copied) out.addPage(page);
    results.push(await finish(out));
    onProgress?.(i + 1, groups.length);
  }

  return results;
}

/** Reorder, rotate and drop pages in a single pass. */
export async function organise(
  source: PdfSource,
  ops: PageOp[],
): Promise<Uint8Array> {
  const src = await load(source);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    ops.map((op) => op.source - 1),
  );

  copied.forEach((page, i) => {
    const extra = ops[i].rotate;
    if (extra) {
      // Rotation is cumulative with whatever the page already carried.
      const current = page.getRotation().angle;
      page.setRotation(degrees(((current + extra) % 360 + 360) % 360));
    }
    out.addPage(page);
  });

  return finish(out);
}

export async function imagesToPdf(
  files: File[],
  opts: ImagesToPdfOptions,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const image = await embedImage(out, files[i]);
    const { width: iw, height: ih } = image;

    if (opts.pageSize === "fit") {
      // A page exactly the size of the picture, plus any margin.
      const page = out.addPage([iw + opts.margin * 2, ih + opts.margin * 2]);
      page.drawImage(image, { x: opts.margin, y: opts.margin, width: iw, height: ih });
    } else {
      const [pw, ph] = PAGE_SIZES[opts.pageSize];
      const landscape =
        opts.orientation === "landscape" || (opts.orientation === "auto" && iw > ih);
      const [pageW, pageH] = landscape ? [ph, pw] : [pw, ph];

      const page = out.addPage([pageW, pageH]);
      const boxW = pageW - opts.margin * 2;
      const boxH = pageH - opts.margin * 2;
      // Contain, never crop, and never enlarge a small image past 1:1.
      const scale = Math.min(boxW / iw, boxH / ih, 1);
      const w = iw * scale;
      const h = ih * scale;

      page.drawImage(image, {
        x: (pageW - w) / 2,
        y: (pageH - h) / 2,
        width: w,
        height: h,
      });
    }

    onProgress?.(i + 1, files.length);
  }

  return finish(out);
}

/**
 * Rebuilds a document from one image per page, each page kept at its exact
 * original size in points.
 *
 * This is how "compress hard" works: pages are rendered to JPEG and reassembled.
 * It trades away selectable text for a large size reduction, which is the right
 * trade when a portal refuses anything over 2MB — but only when the user has
 * been told, which is why it's a separate function from the lossless path.
 */
export async function rebuildFromPageImages(
  images: Array<{ data: ArrayBuffer; format: "png" | "jpg" }>,
  sizes: Array<{ width: number; height: number }>,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();

  for (let i = 0; i < images.length; i++) {
    const { data, format } = images[i];
    const embedded =
      format === "jpg" ? await out.embedJpg(data) : await out.embedPng(data);

    const size = sizes[i] ?? { width: embedded.width, height: embedded.height };
    const page = out.addPage([size.width, size.height]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
    });

    onProgress?.(i + 1, images.length);
  }

  return finish(out);
}

/**
 * Re-saves without re-encoding anything: drops metadata and lets pdf-lib
 * write compressed object streams. Modest savings, but completely lossless —
 * text stays text and stays searchable.
 */
export async function shrinkLossless(source: PdfSource): Promise<Uint8Array> {
  const doc = await load(source);

  doc.setTitle("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setAuthor("");

  const bytes = await doc.save({ useObjectStreams: true });
  return bytes;
}

export async function addPageNumbers(
  source: PdfSource,
  opts: PageNumberOptions,
): Promise<Uint8Array> {
  const doc = await load(source);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const skip = new Set(opts.skipPages);

  let counter = opts.startAt;
  const numbered = pages.length - skip.size;

  pages.forEach((page, index) => {
    if (skip.has(index + 1)) return;

    const label = opts.format
      .replace(/\{n\}/g, String(counter))
      .replace(/\{total\}/g, String(numbered));
    counter++;

    drawAtCorner(page, label, font, opts);
  });

  return finish(doc);
}

export async function watermark(
  source: PdfSource,
  opts: WatermarkOptions,
): Promise<Uint8Array> {
  const doc = await load(source);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const colour = rgb(opts.colour.r, opts.colour.g, opts.colour.b);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(opts.text, opts.fontSize);

    if (opts.tile) {
      const stepX = textWidth + opts.fontSize * 4;
      const stepY = opts.fontSize * 5;
      for (let y = -height; y < height * 2; y += stepY) {
        for (let x = -width; x < width * 2; x += stepX) {
          page.drawText(opts.text, {
            x,
            y,
            size: opts.fontSize,
            font,
            color: colour,
            opacity: opts.opacity,
            rotate: degrees(opts.angle),
          });
        }
      }
    } else {
      // Centre the rotated baseline on the page.
      const radians = (opts.angle * Math.PI) / 180;
      const x = width / 2 - (textWidth / 2) * Math.cos(radians);
      const y = height / 2 - (textWidth / 2) * Math.sin(radians);

      page.drawText(opts.text, {
        x,
        y,
        size: opts.fontSize,
        font,
        color: colour,
        opacity: opts.opacity,
        rotate: degrees(opts.angle),
      });
    }
  }

  return finish(doc);
}

/**
 * Rebuilds a document, swapping specific pages for flattened images and
 * copying the rest untouched.
 *
 * This is what makes redaction real. Drawing a black rectangle over text
 * leaves the text sitting underneath, fully extractable by anyone who selects
 * it or runs a parser — a mistake that has leaked court filings and contracts
 * repeatedly. Replacing the page with a picture of itself, with the blackout
 * already burned in, genuinely destroys the content. Pages with nothing to
 * hide keep their real text, so the document stays as searchable as possible.
 */
export async function replacePagesWithImages(
  source: PdfSource,
  replacements: Array<{
    page: number;
    data: ArrayBuffer;
    format: "png" | "jpg";
  }>,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const src = await load(source);
  const out = await PDFDocument.create();
  const byPage = new Map(replacements.map((r) => [r.page, r]));
  const total = src.getPageCount();

  for (let index = 0; index < total; index++) {
    const replacement = byPage.get(index + 1);

    if (replacement) {
      const original = src.getPage(index);
      const { width, height } = original.getSize();
      const image =
        replacement.format === "jpg"
          ? await out.embedJpg(replacement.data)
          : await out.embedPng(replacement.data);

      const page = out.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
    } else {
      const [copied] = await out.copyPages(src, [index]);
      out.addPage(copied);
    }

    onProgress?.(index + 1, total);
  }

  return finish(out);
}

/** Where to stamp something, in points from the page's bottom-left corner. */
export interface Placement {
  /** 1-based page number. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees anticlockwise. */
  rotate?: number;
  opacity?: number;
}

/** Stamps one image — a signature, initials, a logo — at each placement. */
export async function placeImage(
  source: PdfSource,
  image: { data: ArrayBuffer; format: "png" | "jpg" },
  placements: Placement[],
): Promise<Uint8Array> {
  const doc = await load(source);
  const embedded =
    image.format === "jpg"
      ? await doc.embedJpg(image.data)
      : await doc.embedPng(image.data);

  const pages = doc.getPages();

  for (const spot of placements) {
    const page = pages[spot.page - 1];
    if (!page) continue;
    page.drawImage(embedded, {
      x: spot.x,
      y: spot.y,
      width: spot.width,
      height: spot.height,
      rotate: degrees(spot.rotate ?? 0),
      opacity: spot.opacity ?? 1,
    });
  }

  return finish(doc);
}

/** Red, green and blue as 0-1 fractions, matching pdf-lib's `rgb()`. */
export interface Colour {
  r: number;
  g: number;
  b: number;
}

export interface TextEdit extends Placement {
  text: string;
  fontSize: number;
  colour?: Colour;
  /** Paints this colour behind the text first, hiding what was there. */
  cover?: Colour | null;
}

/**
 * Covers a region and writes new text over it.
 *
 * This is what "edit PDF text" honestly is without a full layout engine for
 * arbitrary documents: the old glyphs are hidden, not deleted, so anyone
 * extracting text still finds them. Fine for fixing a typo before printing;
 * not a way to hide anything sensitive — that's what redaction is for.
 */
export async function overlayText(
  source: PdfSource,
  edits: TextEdit[],
): Promise<Uint8Array> {
  const doc = await load(source);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const edit of edits) {
    const page = pages[edit.page - 1];
    if (!page) continue;

    if (edit.cover !== null) {
      const cover = edit.cover ?? { r: 1, g: 1, b: 1 };
      page.drawRectangle({
        x: edit.x,
        y: edit.y,
        width: edit.width,
        height: edit.height,
        color: rgb(cover.r, cover.g, cover.b),
      });
    }

    if (edit.text) {
      const colour = edit.colour ?? { r: 0, g: 0, b: 0 };
      page.drawText(edit.text, {
        x: edit.x + 1,
        // Sit the baseline inside the box rather than on its floor.
        y: edit.y + (edit.height - edit.fontSize) / 2 + edit.fontSize * 0.22,
        size: edit.fontSize,
        font,
        color: rgb(colour.r, colour.g, colour.b),
      });
    }
  }

  return finish(doc);
}

export interface FormField {
  name: string;
  kind: "text" | "checkbox" | "radio" | "dropdown" | "option" | "unknown";
  value: string;
  /** For dropdowns and radio groups. */
  options?: string[];
  readOnly?: boolean;
}

/** Reads the fillable fields out of a form, with their current values. */
export async function listFormFields(source: PdfSource): Promise<FormField[]> {
  const doc = await load(source);

  let form;
  try {
    form = doc.getForm();
  } catch {
    return [];
  }

  return form.getFields().map((field) => {
    const name = field.getName();
    const type = field.constructor.name;

    try {
      if (type === "PDFTextField") {
        const f = field as unknown as { getText: () => string | undefined };
        return { name, kind: "text" as const, value: f.getText() ?? "" };
      }
      if (type === "PDFCheckBox") {
        const f = field as unknown as { isChecked: () => boolean };
        return { name, kind: "checkbox" as const, value: f.isChecked() ? "on" : "" };
      }
      if (type === "PDFDropdown" || type === "PDFOptionList") {
        const f = field as unknown as {
          getSelected: () => string[];
          getOptions: () => string[];
        };
        return {
          name,
          kind: type === "PDFDropdown" ? ("dropdown" as const) : ("option" as const),
          value: f.getSelected()[0] ?? "",
          options: f.getOptions(),
        };
      }
      if (type === "PDFRadioGroup") {
        const f = field as unknown as {
          getSelected: () => string | undefined;
          getOptions: () => string[];
        };
        return {
          name,
          kind: "radio" as const,
          value: f.getSelected() ?? "",
          options: f.getOptions(),
        };
      }
    } catch {
      // A malformed field shouldn't hide the rest of the form.
    }

    return { name, kind: "unknown" as const, value: "" };
  });
}

/**
 * Fills a form. Flattening bakes the answers into the page so they can't be
 * changed — which is what people mean by "lock it before sending".
 */
export async function fillForm(
  source: PdfSource,
  values: Record<string, string>,
  flatten: boolean,
): Promise<Uint8Array> {
  const doc = await load(source);
  const form = doc.getForm();

  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in values)) continue;
    const value = values[name];
    const type = field.constructor.name;

    try {
      if (type === "PDFTextField") {
        (field as unknown as { setText: (v: string) => void }).setText(value);
      } else if (type === "PDFCheckBox") {
        const box = field as unknown as { check: () => void; uncheck: () => void };
        if (value) box.check();
        else box.uncheck();
      } else if (type === "PDFDropdown" || type === "PDFOptionList") {
        if (value) (field as unknown as { select: (v: string) => void }).select(value);
      } else if (type === "PDFRadioGroup") {
        if (value) (field as unknown as { select: (v: string) => void }).select(value);
      }
    } catch {
      // Skip a value the field won't accept rather than losing the whole fill.
    }
  }

  if (flatten) form.flatten();
  return finish(doc);
}

export async function protect(
  source: PdfSource,
  opts: ProtectOptions,
): Promise<Uint8Array> {
  const doc = await load(source);
  await doc.encrypt({
    userPassword: opts.userPassword,
    ownerPassword: opts.ownerPassword || opts.userPassword,
    permissions: {
      printing: opts.allowPrinting ? "highResolution" : undefined,
      copying: opts.allowCopying,
      modifying: false,
    },
  });
  return finish(doc);
}

/** Re-saves without encryption. Needs the password that opens the file. */
export async function unlock(
  source: PdfSource,
  password: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await bytesOf(source), { password });
  // Copying into a fresh document is what actually drops the /Encrypt
  // dictionary — re-saving the loaded one can carry it over.
  const out = await PDFDocument.create();
  const pages = await out.copyPages(doc, doc.getPageIndices());
  for (const page of pages) out.addPage(page);
  return finish(out);
}

function drawAtCorner(
  page: PDFPage,
  label: string,
  font: PDFFont,
  opts: PageNumberOptions,
): void {
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(label, opts.fontSize);
  const m = opts.margin;

  const positions: Record<Corner, [number, number]> = {
    "top-left": [m, height - m - opts.fontSize],
    "top-centre": [(width - textWidth) / 2, height - m - opts.fontSize],
    "top-right": [width - textWidth - m, height - m - opts.fontSize],
    "bottom-left": [m, m],
    "bottom-centre": [(width - textWidth) / 2, m],
    "bottom-right": [width - textWidth - m, m],
  };

  const [x, y] = positions[opts.position];
  page.drawText(label, { x, y, size: opts.fontSize, font, color: rgb(0, 0, 0) });
}
