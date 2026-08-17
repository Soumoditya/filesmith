/**
 * The geometry and colour arithmetic behind the image tools.
 *
 * Kept free of Canvas and DOM so it can be tested directly — getting a resize
 * or a print layout slightly wrong produces output that looks plausible and
 * is quietly unusable, which is exactly the kind of bug tests are for.
 */

export interface Size {
  width: number;
  height: number;
}

export type FitMode = "contain" | "cover" | "stretch";

/**
 * Works out the output size from whatever the user actually specified.
 *
 * Either dimension may be left blank, in which case it follows from the other
 * to preserve the aspect ratio — which is what people expect when they type a
 * width and tab away.
 */
export function resolveSize(
  source: Size,
  requested: { width?: number | null; height?: number | null },
  keepRatio: boolean,
): Size {
  const { width, height } = requested;
  const ratio = source.width / source.height;

  const clamp = (n: number) => Math.max(1, Math.round(n));

  if (width && height) {
    return keepRatio
      ? // Fit inside the box without distorting.
        (() => {
          const scale = Math.min(width / source.width, height / source.height);
          return { width: clamp(source.width * scale), height: clamp(source.height * scale) };
        })()
      : { width: clamp(width), height: clamp(height) };
  }

  if (width) return { width: clamp(width), height: clamp(width / ratio) };
  if (height) return { width: clamp(height * ratio), height: clamp(height) };
  return { width: source.width, height: source.height };
}

/** Scales by a percentage. */
export function scaleSize(source: Size, percent: number): Size {
  const factor = percent / 100;
  return {
    width: Math.max(1, Math.round(source.width * factor)),
    height: Math.max(1, Math.round(source.height * factor)),
  };
}

/**
 * Where to draw a source image inside a target box for a given fit mode.
 * Returns source and destination rectangles, ready for `drawImage`.
 */
export function fitRect(source: Size, target: Size, mode: FitMode) {
  if (mode === "stretch") {
    return {
      sx: 0,
      sy: 0,
      sw: source.width,
      sh: source.height,
      dx: 0,
      dy: 0,
      dw: target.width,
      dh: target.height,
    };
  }

  const scale =
    mode === "cover"
      ? Math.max(target.width / source.width, target.height / source.height)
      : Math.min(target.width / source.width, target.height / source.height);

  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;

  if (mode === "contain") {
    return {
      sx: 0,
      sy: 0,
      sw: source.width,
      sh: source.height,
      dx: (target.width - drawWidth) / 2,
      dy: (target.height - drawHeight) / 2,
      dw: drawWidth,
      dh: drawHeight,
    };
  }

  // Cover: crop the overflow from the centre of the source.
  const sw = target.width / scale;
  const sh = target.height / scale;
  return {
    sx: (source.width - sw) / 2,
    sy: (source.height - sh) / 2,
    sw,
    sh,
    dx: 0,
    dy: 0,
    dw: target.width,
    dh: target.height,
  };
}

/** Canvas size after rotating by a right angle. */
export function rotatedSize(source: Size, degrees: number): Size {
  const turns = ((Math.round(degrees / 90) % 4) + 4) % 4;
  return turns % 2 === 1
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

/* ------------------------------------------------------------------ colours */

export interface Swatch {
  hex: string;
  rgb: [number, number, number];
  /** Share of sampled pixels, 0-1. */
  share: number;
}

const toHex = (n: number) => n.toString(16).padStart(2, "0");

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(Math.round(r))}${toHex(Math.round(g))}${toHex(Math.round(b))}`;
}

/**
 * Extracts the dominant colours from RGBA pixel data.
 *
 * Colours are bucketed into a coarse grid rather than clustered properly:
 * far cheaper than k-means, and for "what colours are in this picture?" the
 * difference is invisible. Near-transparent pixels are skipped so a logo on
 * transparency doesn't come back as a palette of nothing.
 */
export function extractPalette(
  pixels: Uint8ClampedArray,
  count = 6,
  buckets = 6,
): Swatch[] {
  const size = 256 / buckets;
  const bins = new Map<number, { r: number; g: number; b: number; n: number }>();
  let sampled = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const key =
      Math.floor(r / size) * buckets * buckets +
      Math.floor(g / size) * buckets +
      Math.floor(b / size);

    const bin = bins.get(key);
    if (bin) {
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bin.n++;
    } else {
      bins.set(key, { r, g, b, n: 1 });
    }
    sampled++;
  }

  if (sampled === 0) return [];

  return [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((bin) => {
      const rgb: [number, number, number] = [
        Math.round(bin.r / bin.n),
        Math.round(bin.g / bin.n),
        Math.round(bin.b / bin.n),
      ];
      return { hex: rgbToHex(...rgb), rgb, share: bin.n / sampled };
    });
}

/** Perceived brightness, for deciding whether to put white or black on top. */
export function luminance([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/* ------------------------------------------------------------ passport photo */

export interface PhotoSpec {
  id: string;
  label: string;
  /** Photo size in millimetres. */
  width: number;
  height: number;
  note?: string;
}

/** The sizes people are actually asked for. */
export const PHOTO_SPECS: PhotoSpec[] = [
  { id: "in-passport", label: "India — passport", width: 35, height: 45, note: "Also most exam and visa forms" },
  { id: "in-pan", label: "India — PAN card", width: 25, height: 35 },
  { id: "in-stamp", label: "India — stamp size", width: 22, height: 27 },
  { id: "us-passport", label: "US — passport", width: 51, height: 51, note: "2 × 2 inches" },
  { id: "uk-passport", label: "UK / EU — passport", width: 35, height: 45 },
  { id: "schengen", label: "Schengen visa", width: 35, height: 45 },
  { id: "cn-visa", label: "China — visa", width: 33, height: 48 },
];

export const PAPER_SIZES = {
  "4x6": { label: "4 × 6 inch photo paper", width: 152.4, height: 101.6 },
  a4: { label: "A4 sheet", width: 210, height: 297 },
  letter: { label: "Letter sheet", width: 215.9, height: 279.4 },
} as const;

export type PaperId = keyof typeof PAPER_SIZES;

export interface SheetLayout {
  columns: number;
  rows: number;
  total: number;
  /** Millimetre offsets of each photo's top-left corner. */
  positions: Array<{ x: number; y: number }>;
  paper: { width: number; height: number };
  photo: { width: number; height: number };
}

/**
 * Tiles as many copies of a photo onto a sheet as will fit.
 *
 * Tries both orientations of the photo and keeps whichever yields more
 * copies — rotating a 35×45 by 90° often fits an extra row, and paying for a
 * print of six instead of eight is a real annoyance.
 */
export function layoutPhotoSheet(
  photo: { width: number; height: number },
  paper: { width: number; height: number },
  gapMm = 2,
  marginMm = 5,
): SheetLayout {
  const usableWidth = paper.width - marginMm * 2;
  const usableHeight = paper.height - marginMm * 2;

  const arrange = (w: number, h: number) => {
    const columns = Math.floor((usableWidth + gapMm) / (w + gapMm));
    const rows = Math.floor((usableHeight + gapMm) / (h + gapMm));
    return { columns: Math.max(columns, 0), rows: Math.max(rows, 0), w, h };
  };

  const upright = arrange(photo.width, photo.height);
  const turned = arrange(photo.height, photo.width);
  const best =
    turned.columns * turned.rows > upright.columns * upright.rows ? turned : upright;

  const positions: Array<{ x: number; y: number }> = [];
  // Centre the block of photos rather than hugging the top-left corner.
  const blockWidth = best.columns * best.w + Math.max(best.columns - 1, 0) * gapMm;
  const blockHeight = best.rows * best.h + Math.max(best.rows - 1, 0) * gapMm;
  const offsetX = (paper.width - blockWidth) / 2;
  const offsetY = (paper.height - blockHeight) / 2;

  for (let row = 0; row < best.rows; row++) {
    for (let column = 0; column < best.columns; column++) {
      positions.push({
        x: offsetX + column * (best.w + gapMm),
        y: offsetY + row * (best.h + gapMm),
      });
    }
  }

  return {
    columns: best.columns,
    rows: best.rows,
    total: positions.length,
    positions,
    paper,
    photo: { width: best.w, height: best.h },
  };
}

/** Millimetres to pixels at a print resolution. */
export const mmToPx = (mm: number, dpi = 300) => Math.round((mm / 25.4) * dpi);

/* ---------------------------------------------------------------- favicons */

export interface IconSpec {
  name: string;
  size: number;
  /** Leaves room around the mark so a circular crop can't clip it. */
  maskable?: boolean;
}

export const FAVICON_SET: IconSpec[] = [
  { name: "favicon-16.png", size: 16 },
  { name: "favicon-32.png", size: 32 },
  { name: "favicon-48.png", size: 48 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
];

export function faviconManifest(name: string, themeColour: string): string {
  return JSON.stringify(
    {
      name,
      short_name: name.slice(0, 12),
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
      theme_color: themeColour,
      background_color: themeColour,
      display: "standalone",
      start_url: "/",
    },
    null,
    2,
  );
}

export function faviconHtml(): string {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="32x32">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ].join("\n");
}
