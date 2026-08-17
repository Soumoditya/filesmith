import { extensionOf } from "./files";
import {
  fitRect,
  mmToPx,
  rotatedSize,
  type FitMode,
  type Size,
} from "./imageMath";

/**
 * Canvas-backed image processing.
 *
 * The browser already decodes and encodes JPEG, PNG and WebP natively, which
 * covers almost everything people bring — so those paths need no download at
 * all. AVIF encoding and HEIC decoding are the two gaps, and each pulls its
 * WebAssembly codec only when a file actually needs it.
 */

export type OutputFormat = "jpeg" | "png" | "webp" | "avif";

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  jpeg: "JPG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
};

export const FORMAT_NOTES: Record<OutputFormat, string> = {
  jpeg: "Opens anywhere. Best for photographs. No transparency.",
  png: "Keeps every pixel and supports transparency. Large files.",
  webp: "Around 30% smaller than JPG at the same quality. Supported everywhere current.",
  avif: "Smallest of all, and slow to create. Not readable by older software.",
};

export const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
};

const HEIC_EXTENSIONS = new Set(["heic", "heif"]);

/** True when the browser can't decode this itself. */
export function needsHeicDecode(file: File): boolean {
  return HEIC_EXTENSIONS.has(extensionOf(file.name));
}

/**
 * Decodes any supported image to an ImageBitmap.
 *
 * HEIC — what iPhones produce by default — is unreadable by most browsers, so
 * it goes through libheif. That's a genuine gap people hit constantly when a
 * form demands a JPG.
 */
export async function decodeImage(file: File | Blob): Promise<ImageBitmap> {
  const name = file instanceof File ? file.name : "";
  const isHeic = HEIC_EXTENSIONS.has(extensionOf(name));

  if (!isHeic) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through: some browsers reject formats they nominally support.
    }
  }

  if (isHeic) {
    const { default: libheif } = await import("libheif-js/wasm-bundle");
    const decoder = new libheif.HeifDecoder();
    const images = decoder.decode(new Uint8Array(await file.arrayBuffer()));
    if (images.length === 0) throw new Error("This HEIC file has no image in it.");

    const image = images[0];
    const width = image.get_width();
    const height = image.get_height();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser wouldn't give us a canvas to draw on.");

    const imageData = ctx.createImageData(width, height);
    await new Promise<void>((resolve, reject) => {
      image.display(imageData, (result: unknown) =>
        result ? resolve() : reject(new Error("Couldn't read this HEIC file.")),
      );
    });
    ctx.putImageData(imageData, 0, 0);
    return createImageBitmap(canvas);
  }

  throw new Error(
    "This file couldn't be read as an image. It may be damaged, or in a format the browser doesn't know.",
  );
}

export interface Transform {
  /** Output size. Omit to keep the source size. */
  size?: Size;
  fit?: FitMode;
  /** Right-angle rotation. */
  rotate?: 0 | 90 | 180 | 270;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  /** Fractional crop of the source, applied before everything else. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Painted behind the image — needed when flattening transparency to JPEG. */
  background?: string | null;
}

/** Applies a transform and returns the canvas, ready to encode. */
export async function transformImage(
  bitmap: ImageBitmap,
  transform: Transform = {},
): Promise<HTMLCanvasElement> {
  // Crop first, so every later measurement is of the region being kept.
  let source: ImageBitmap | HTMLCanvasElement = bitmap;
  let sourceSize: Size = { width: bitmap.width, height: bitmap.height };

  if (transform.crop) {
    const { x, y, width, height } = transform.crop;
    const cropped = document.createElement("canvas");
    cropped.width = Math.max(1, Math.round(width * bitmap.width));
    cropped.height = Math.max(1, Math.round(height * bitmap.height));
    const cropCtx = cropped.getContext("2d");
    if (!cropCtx) throw new Error("Your browser wouldn't give us a canvas to draw on.");
    cropCtx.drawImage(
      bitmap,
      x * bitmap.width,
      y * bitmap.height,
      cropped.width,
      cropped.height,
      0,
      0,
      cropped.width,
      cropped.height,
    );
    source = cropped;
    sourceSize = { width: cropped.width, height: cropped.height };
  }

  const target = transform.size ?? sourceSize;
  const rotate = transform.rotate ?? 0;
  const final = rotatedSize(target, rotate);

  const canvas = document.createElement("canvas");
  canvas.width = final.width;
  canvas.height = final.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser wouldn't give us a canvas to draw on.");

  if (transform.background) {
    ctx.fillStyle = transform.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (rotate) ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(transform.flipHorizontal ? -1 : 1, transform.flipVertical ? -1 : 1);
  ctx.translate(-target.width / 2, -target.height / 2);

  // Better downscaling than the browser's default nearest-neighbour rush.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const rect = fitRect(sourceSize, target, transform.fit ?? "stretch");
  ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
  ctx.restore();

  return canvas;
}

/** Encodes a canvas, reaching for a WASM codec only when AVIF is asked for. */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  quality = 0.85,
): Promise<Blob> {
  if (format === "avif") {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser wouldn't give us a canvas to draw on.");
    const { encode } = await import("@jsquash/avif");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = await encode(data, { quality: Math.round(quality * 100) });
    return new Blob([buffer], { type: "image/avif" });
  }

  const mime = `image/${format}` as "image/jpeg" | "image/png" | "image/webp";

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new Error(
                `Your browser couldn't save this as ${FORMAT_LABELS[format]}. Try a different format.`,
              ),
            ),
      mime,
      format === "png" ? undefined : quality,
    );
  });
}

/** One-shot decode, transform and encode. */
export async function processImage(
  file: File,
  transform: Transform,
  format: OutputFormat,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await decodeImage(file);
  try {
    const canvas = await transformImage(bitmap, {
      // JPEG has no alpha channel, so transparency has to land on something.
      background: format === "jpeg" ? (transform.background ?? "#ffffff") : transform.background,
      ...transform,
    });
    const blob = await encodeCanvas(canvas, format, quality);
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

/** Reads an image's dimensions without keeping the decoded pixels around. */
export async function imageSize(file: File): Promise<Size> {
  const bitmap = await decodeImage(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** Pixel data for palette extraction, downsampled so it stays quick. */
export async function samplePixels(file: File, maxSide = 160): Promise<Uint8ClampedArray> {
  const bitmap = await decodeImage(file);
  try {
    const scale = Math.min(maxSide / bitmap.width, maxSide / bitmap.height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Your browser wouldn't give us a canvas to draw on.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } finally {
    bitmap.close();
  }
}

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  colour: string;
  opacity: number;
  position:
    | "top-left"
    | "top-centre"
    | "top-right"
    | "centre"
    | "bottom-left"
    | "bottom-centre"
    | "bottom-right";
  margin: number;
  rotate: number;
  tile: boolean;
}

/** Draws a text watermark onto an existing canvas, in place. */
export function drawWatermark(canvas: HTMLCanvasElement, options: WatermarkOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || !options.text) return;

  // Scale the requested size against a 1000px reference so the same setting
  // looks the same on a thumbnail and on a 6000px photo.
  const scale = Math.max(canvas.width, canvas.height) / 1000;
  const size = options.fontSize * scale;

  ctx.save();
  ctx.globalAlpha = options.opacity;
  ctx.fillStyle = options.colour;
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "middle";

  const metrics = ctx.measureText(options.text);
  const margin = options.margin * scale;

  if (options.tile) {
    const stepX = metrics.width + size * 3;
    const stepY = size * 4;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((-options.rotate * Math.PI) / 180);
    ctx.translate(-canvas.width, -canvas.height);
    for (let y = 0; y < canvas.height * 2; y += stepY) {
      for (let x = 0; x < canvas.width * 2; x += stepX) {
        ctx.fillText(options.text, x, y);
      }
    }
    ctx.restore();
    return;
  }

  const [vertical, horizontal] = options.position.split("-");
  const x =
    horizontal === "left"
      ? margin
      : horizontal === "right"
        ? canvas.width - metrics.width - margin
        : (canvas.width - metrics.width) / 2;
  const y =
    vertical === "top"
      ? margin + size / 2
      : vertical === "bottom"
        ? canvas.height - margin - size / 2
        : canvas.height / 2;

  ctx.translate(x + metrics.width / 2, y);
  ctx.rotate((-options.rotate * Math.PI) / 180);
  ctx.fillText(options.text, -metrics.width / 2, 0);
  ctx.restore();
}

/** Lays out repeated copies of a photo on a print sheet. */
export async function buildPhotoSheet(
  photo: Blob,
  layout: {
    positions: Array<{ x: number; y: number }>;
    paper: Size;
    photo: Size;
  },
  dpi = 300,
  border = true,
): Promise<Blob> {
  const bitmap = await decodeImage(photo);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = mmToPx(layout.paper.width, dpi);
    canvas.height = mmToPx(layout.paper.height, dpi);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser wouldn't give us a canvas to draw on.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";

    const width = mmToPx(layout.photo.width, dpi);
    const height = mmToPx(layout.photo.height, dpi);

    for (const spot of layout.positions) {
      const x = mmToPx(spot.x, dpi);
      const y = mmToPx(spot.y, dpi);
      ctx.drawImage(bitmap, x, y, width, height);
      if (border) {
        // A hairline so there's something to cut along.
        ctx.strokeStyle = "#b8b8b8";
        ctx.lineWidth = Math.max(1, Math.round(dpi / 300));
        ctx.strokeRect(x, y, width, height);
      }
    }

    return encodeCanvas(canvas, "jpeg", 0.94);
  } finally {
    bitmap.close();
  }
}
