import { describe, expect, it } from "vitest";
import {
  extractPalette,
  faviconManifest,
  fitRect,
  layoutPhotoSheet,
  luminance,
  mmToPx,
  PAPER_SIZES,
  PHOTO_SPECS,
  resolveSize,
  rgbToHex,
  rotatedSize,
  scaleSize,
} from "./imageMath";

const landscape = { width: 1600, height: 900 };
const portrait = { width: 900, height: 1600 };

describe("resolveSize", () => {
  it("derives the missing dimension from the aspect ratio", () => {
    expect(resolveSize(landscape, { width: 800 }, true)).toEqual({
      width: 800,
      height: 450,
    });
    expect(resolveSize(landscape, { height: 450 }, true)).toEqual({
      width: 800,
      height: 450,
    });
  });

  it("fits inside both dimensions when the ratio is locked", () => {
    // A 1600x900 image asked to fit 800x800 must not become 800x800.
    expect(resolveSize(landscape, { width: 800, height: 800 }, true)).toEqual({
      width: 800,
      height: 450,
    });
  });

  it("distorts only when the user unlocks the ratio", () => {
    expect(resolveSize(landscape, { width: 800, height: 800 }, false)).toEqual({
      width: 800,
      height: 800,
    });
  });

  it("returns the original when nothing is asked for", () => {
    expect(resolveSize(landscape, {}, true)).toEqual(landscape);
  });

  it("never produces a zero or fractional dimension", () => {
    const tiny = resolveSize(landscape, { width: 1 }, true);
    expect(tiny.width).toBe(1);
    expect(tiny.height).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(tiny.height)).toBe(true);
  });
});

describe("scaleSize", () => {
  it("scales both dimensions", () => {
    expect(scaleSize(landscape, 50)).toEqual({ width: 800, height: 450 });
    expect(scaleSize(landscape, 200)).toEqual({ width: 3200, height: 1800 });
  });

  it("clamps to at least one pixel", () => {
    expect(scaleSize({ width: 10, height: 10 }, 1)).toEqual({ width: 1, height: 1 });
  });
});

describe("fitRect", () => {
  it("contain letterboxes without cropping", () => {
    const r = fitRect(landscape, { width: 800, height: 800 }, "contain");
    expect(r.sw).toBe(1600);
    expect(r.sh).toBe(900);
    expect(r.dw).toBe(800);
    expect(r.dh).toBe(450);
    // Centred vertically.
    expect(r.dy).toBeCloseTo(175, 5);
  });

  it("cover fills the box by cropping the source", () => {
    const r = fitRect(landscape, { width: 800, height: 800 }, "cover");
    expect(r.dw).toBe(800);
    expect(r.dh).toBe(800);
    // Crops the sides of a landscape source, centred.
    expect(r.sh).toBe(900);
    expect(r.sw).toBeCloseTo(900, 5);
    expect(r.sx).toBeCloseTo(350, 5);
  });

  it("stretch uses everything and distorts", () => {
    const r = fitRect(landscape, { width: 500, height: 500 }, "stretch");
    expect(r).toMatchObject({ sx: 0, sy: 0, sw: 1600, sh: 900, dw: 500, dh: 500 });
  });

  it("handles a portrait source into a landscape box", () => {
    const r = fitRect(portrait, { width: 800, height: 400 }, "cover");
    expect(r.dw).toBe(800);
    expect(r.dh).toBe(400);
    expect(r.sy).toBeGreaterThan(0);
  });
});

describe("rotatedSize", () => {
  it("swaps dimensions on quarter turns only", () => {
    expect(rotatedSize(landscape, 90)).toEqual({ width: 900, height: 1600 });
    expect(rotatedSize(landscape, 180)).toEqual(landscape);
    expect(rotatedSize(landscape, 270)).toEqual({ width: 900, height: 1600 });
    expect(rotatedSize(landscape, 360)).toEqual(landscape);
  });

  it("handles negative angles", () => {
    expect(rotatedSize(landscape, -90)).toEqual({ width: 900, height: 1600 });
  });
});

describe("palette", () => {
  /** Builds RGBA pixel data from a list of colours. */
  const pixels = (colours: Array<[number, number, number, number?]>) => {
    const data = new Uint8ClampedArray(colours.length * 4);
    colours.forEach(([r, g, b, a = 255], i) => {
      data.set([r, g, b, a], i * 4);
    });
    return data;
  };

  it("finds the dominant colour first", () => {
    const data = pixels([
      [255, 0, 0],
      [250, 5, 5],
      [252, 2, 2],
      [0, 0, 255],
    ]);
    const palette = extractPalette(data, 4);
    expect(palette[0].rgb[0]).toBeGreaterThan(200);
    expect(palette[0].share).toBeGreaterThan(0.5);
  });

  it("ignores near-transparent pixels", () => {
    // A logo on transparency must not come back as a palette of nothing.
    const data = pixels([
      [0, 255, 0, 255],
      [10, 10, 10, 0],
      [20, 20, 20, 10],
    ]);
    const palette = extractPalette(data, 4);
    expect(palette).toHaveLength(1);
    expect(palette[0].share).toBe(1);
  });

  it("returns nothing for a fully transparent image", () => {
    expect(extractPalette(pixels([[0, 0, 0, 0]]), 4)).toEqual([]);
  });

  it("shares sum to roughly one", () => {
    const data = pixels([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
    ]);
    const total = extractPalette(data, 8).reduce((s, c) => s + c.share, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("respects the requested count", () => {
    const many = Array.from({ length: 40 }, (_, i) => [i * 6, 255 - i * 6, i * 3] as [number, number, number]);
    expect(extractPalette(pixels(many), 3).length).toBeLessThanOrEqual(3);
  });
});

describe("rgbToHex and luminance", () => {
  it("formats hex with padding", () => {
    expect(rgbToHex(255, 255, 255)).toBe("#ffffff");
    expect(rgbToHex(0, 0, 0)).toBe("#000000");
    expect(rgbToHex(1, 2, 3)).toBe("#010203");
  });

  it("puts white above black and black below white", () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 2);
    expect(luminance([0, 0, 0])).toBe(0);
    // Green reads much brighter than blue at the same value.
    expect(luminance([0, 255, 0])).toBeGreaterThan(luminance([0, 0, 255]));
  });
});

describe("photo sheet layout", () => {
  const passport = PHOTO_SPECS.find((s) => s.id === "in-passport")!;

  it("fits a sensible number of 35x45 photos on 4x6 paper", () => {
    const sheet = layoutPhotoSheet(passport, PAPER_SIZES["4x6"]);
    // The classic photo-shop sheet is eight.
    expect(sheet.total).toBeGreaterThanOrEqual(6);
    expect(sheet.positions).toHaveLength(sheet.total);
  });

  it("fits many more on A4", () => {
    const small = layoutPhotoSheet(passport, PAPER_SIZES["4x6"]);
    const big = layoutPhotoSheet(passport, PAPER_SIZES.a4);
    expect(big.total).toBeGreaterThan(small.total);
  });

  it("rotates the photo when that fits more copies", () => {
    // A wide, short photo on a tall sheet should be turned.
    const sheet = layoutPhotoSheet({ width: 90, height: 30 }, PAPER_SIZES.a4);
    expect(sheet.total).toBeGreaterThan(0);
    const upright = Math.floor(210 / 90) * Math.floor(297 / 30);
    expect(sheet.total).toBeGreaterThanOrEqual(upright);
  });

  it("keeps every photo inside the paper", () => {
    const sheet = layoutPhotoSheet(passport, PAPER_SIZES.a4);
    for (const spot of sheet.positions) {
      expect(spot.x).toBeGreaterThanOrEqual(0);
      expect(spot.y).toBeGreaterThanOrEqual(0);
      expect(spot.x + sheet.photo.width).toBeLessThanOrEqual(sheet.paper.width + 0.01);
      expect(spot.y + sheet.photo.height).toBeLessThanOrEqual(sheet.paper.height + 0.01);
    }
  });

  it("centres the block on the sheet", () => {
    const sheet = layoutPhotoSheet(passport, PAPER_SIZES.a4);
    const left = Math.min(...sheet.positions.map((p) => p.x));
    const right = Math.max(...sheet.positions.map((p) => p.x + sheet.photo.width));
    expect(left).toBeCloseTo(sheet.paper.width - right, 5);
  });

  it("copes with a photo bigger than the paper", () => {
    const sheet = layoutPhotoSheet({ width: 500, height: 500 }, PAPER_SIZES["4x6"]);
    expect(sheet.total).toBe(0);
    expect(sheet.positions).toEqual([]);
  });
});

describe("mmToPx", () => {
  it("converts at print resolution", () => {
    expect(mmToPx(25.4, 300)).toBe(300);
    expect(mmToPx(35, 300)).toBe(413);
    expect(mmToPx(25.4, 72)).toBe(72);
  });
});

describe("favicon manifest", () => {
  it("is valid JSON naming all three icons", () => {
    const parsed = JSON.parse(faviconManifest("My Site", "#dd5c15"));
    expect(parsed.name).toBe("My Site");
    expect(parsed.theme_color).toBe("#dd5c15");
    expect(parsed.icons).toHaveLength(3);
    expect(parsed.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(
      true,
    );
  });

  it("keeps short_name within the length launchers respect", () => {
    const parsed = JSON.parse(faviconManifest("An Extremely Long Site Name", "#000"));
    expect(parsed.short_name.length).toBeLessThanOrEqual(12);
  });
});
