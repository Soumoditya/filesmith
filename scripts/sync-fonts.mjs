/**
 * Copies the webfont files the document engine needs out of node_modules and
 * into public/fonts/.
 *
 * They're served as static assets rather than bundled into JavaScript so the
 * browser fetches only the faces a given document actually uses, and the
 * service worker can cache them for offline use.
 *
 * Run with `npm run fonts` after changing the catalogue. Outputs are
 * committed, so a normal build never needs this.
 */
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allFontFiles } from "../src/lib/doc/fontCatalogue.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "fonts");

await mkdir(outDir, { recursive: true });

const wanted = allFontFiles();
const copied = [];
const missing = [];
let total = 0;

for (const rel of wanted) {
  const src = join(root, "node_modules", rel);
  const name = basename(rel);
  try {
    const info = await stat(src);
    await copyFile(src, join(outDir, name));
    copied.push({ name, bytes: info.size });
    total += info.size;
  } catch {
    missing.push(rel);
  }
}

copied.sort((a, b) => b.bytes - a.bytes);
for (const { name, bytes } of copied) {
  console.log(`  ${(bytes / 1024).toFixed(0).padStart(4)} KB  ${name}`);
}

if (missing.length > 0) {
  // Not fatal: some families genuinely ship no italic, and the stack falls
  // back to the upright face. But it should be visible, not silent.
  console.log(`\n  ${missing.length} listed file(s) don't exist in node_modules:`);
  for (const m of missing) console.log(`    ${basename(m)}`);
}

// A manifest so the loader can check what's actually available before
// requesting a face and getting a 404 back.
const manifest = Object.fromEntries(copied.map((c) => [c.name, c.bytes]));
await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `\n  ${copied.length} files, ${(total / 1024 / 1024).toFixed(2)} MB total (fetched on demand, not up front)`,
);

// Keep the copied fonts out of the repo's noise but present for the build.
const existing = await readdir(outDir);
const stale = existing.filter(
  (f) => f !== "manifest.json" && !copied.some((c) => c.name === f),
);
if (stale.length > 0) {
  console.log(`\n  ${stale.length} stale file(s) in public/fonts — delete manually if unwanted.`);
}
