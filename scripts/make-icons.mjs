/**
 * Renders the full icon set from a single source SVG.
 *
 * Run with `npm run icons` after changing the brand mark. The outputs are
 * committed so a normal build never needs sharp.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const ANVIL =
  "M1.8 8.15 A0.6 0.6 0 0 1 2.05 7.2 L6.4 5.35 A2.4 2.4 0 0 1 7.35 5.15 " +
  "H19.6 A1.6 1.6 0 0 1 21.2 6.75 V8.9 A1.6 1.6 0 0 1 19.6 10.5 H14.55 " +
  "L15.5 14.15 H17.3 A2.2 2.2 0 0 1 19.5 16.35 V18.85 H4.5 V16.35 " +
  "A2.2 2.2 0 0 1 6.7 14.15 H8.5 L9.45 10.5 H6.6 A2.4 2.4 0 0 1 5.2 10.05 Z";

const ORANGE = "#dd5c15";

/**
 * `inset` is the fraction of the canvas the mark occupies. Maskable icons
 * need the mark inside the middle 80% so a circular crop can't clip it.
 */
function markup({ size = 64, radius = 14, inset = 0.69 } = {}) {
  // The path's own bounding box within its 24x24 viewBox.
  const bbox = { x: 1.8, y: 5.15, w: 19.4, h: 13.7 };
  const scale = (size * inset) / bbox.w;
  const tx = (size - bbox.w * scale) / 2 - bbox.x * scale;
  const ty = (size - bbox.h * scale) / 2 - bbox.y * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${ORANGE}"/>
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})" fill="#ffffff">
    <path d="${ANVIL}"/>
  </g>
</svg>`;
}

const render = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const OUTPUTS = [
  { file: "icon-192.png", size: 192, opts: { size: 192, radius: 42 } },
  { file: "icon-512.png", size: 512, opts: { size: 512, radius: 112 } },
  { file: "apple-touch-icon.png", size: 180, opts: { size: 180, radius: 0 } },
  // Full-bleed background, mark pulled in to survive a circular crop.
  {
    file: "icon-maskable-512.png",
    size: 512,
    opts: { size: 512, radius: 0, inset: 0.52 },
  },
];

await mkdir(publicDir, { recursive: true });

// The crisp vector favicon, used by every modern browser.
await writeFile(join(publicDir, "favicon.svg"), `${markup()}\n`);

for (const { file, size, opts } of OUTPUTS) {
  await writeFile(join(publicDir, file), await render(markup(opts), size));
  console.log(`  ${file}  ${size}x${size}`);
}

// A multi-resolution .ico for older browsers and Windows pinned sites.
const icoSizes = [16, 32, 48];
const icoBuffers = await Promise.all(
  icoSizes.map((size) => render(markup({ size: 64, radius: 10 }), size)),
);
await writeFile(join(publicDir, "favicon.ico"), await pngToIco(icoBuffers));
console.log(`  favicon.ico  ${icoSizes.join("/")}`);

// Sanity check: the source SVG we just wrote must actually rasterise.
const written = await readFile(join(publicDir, "favicon.svg"));
const meta = await sharp(written).metadata();
if (!meta.width) throw new Error("favicon.svg did not rasterise");

console.log("Icons written to public/");
