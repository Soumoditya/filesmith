# Filesmith — working notes

Free file tools that run entirely in the browser. Live at
[filesmith.vercel.app](https://filesmith.vercel.app), deployed from `main` on push.

## The rule that shapes everything

**All processing happens on the user's device. Nothing is ever uploaded.**

This is not a privacy garnish — it is what makes the site free and unlimited.
Processing costs nothing per user because it happens on their machine, so there
is no server bill to recoup and no reason for a paid tier. Any change that sends
a user's file anywhere breaks the core promise of the product.

Practical consequences:

- No backend, no API keys, no analytics, no tracking.
- Heavy libraries are lazy-loaded per tool, never in the main bundle.
- Big AI models are one-time downloads, cached, with their size shown first.
- "No file size limit" is honest — the only ceiling is the user's own RAM.

## Layout

| Path | What it is |
| --- | --- |
| `src/lib/registry.ts` | **The spine.** Drives routing, hub pages, search, and the homepage "drop a file, see what you can do with it" matching. |
| `src/lib/doc/` | Document engine: fonts, block model, layout, render. Produces real selectable text. |
| `src/lib/pdfOps.ts` | pdf-lib. **Writes** PDFs. Pure functions, tested in Node. |
| `src/lib/pdfRender.ts` | pdf.js. **Reads and rasterises** PDFs. |
| `src/workers/pdf.worker.ts` | Thin Comlink shim over `pdfOps` — no logic lives here. |
| `src/lib/{image,media,invoice,resume}*` | Per-domain logic, kept free of React so it can be tested. |
| `src/tools/` | One file per tool. Shared shells in `src/tools/image/` and `src/tools/media/`. |
| `src/components/` | Design system and shared UI. |

pdf-lib and pdf.js are both present on purpose: pdf.js reads and draws, pdf-lib
edits and saves, and neither is good at the other's job.

## Adding a tool

1. Write the UI in `src/tools/`, composing `ToolShell` and the primitives in
   `src/components/ui.tsx`. Pass `wide` to `ToolShell` for editor-style tools
   with a side-by-side preview.
2. In `registry.ts`, flip that tool's `status: "soon"` to `"ready"` and add
   `load: () => import("../tools/YourTool")`.

Tools not yet built stay listed as `soon` rather than hidden — the catalogue is
honest about what is coming, and people can see it rather than hunting for
something that does not exist.

Reuse rather than rebuild: `useToolJob` (busy/progress/error state machine),
`ResultCard`, `DropZone`, `FileHeader`, `BatchImageTool`, `MediaShell`,
`PageCanvas`, `useAutosave`.

## Testing

`npm test` · `npm run build` · `npm run dev`

Assert on real output, never on "it didn't throw":

- PDFs are re-opened with pdf.js and their text extracted.
- `.docx` files are unzipped and `word/document.xml` is read.
- Rasterising runs against a real Skia canvas (`@napi-rs/canvas`), installed as
  globals in `vitest.setup.ts` before any module imports pdf.js.
- Media and image maths are separated from the DOM so they can be unit tested.

## Two traps that have already cost real time

**Fonts silently mangle text.** The built-in PDF fonts replace anything they
cannot encode with `?` and throw *nothing*. `नमस्ते ₹` becomes `?????? ?`. Worse,
webfont packages ship fonts split by Unicode range, so plain Inter has no `₹` at
all — it lives in latin-ext. Hence the fallback stack in `src/lib/doc/fonts.ts`.
Never assume text survived; assert it did.

**pdf.js renders off animation frames.** `render()` never settles in a tab that
is not compositing — a hidden pane, or a background tab. Parsing still works,
which makes it look like a rendering bug. If a preview hangs in a headless
browser, this is why; it is not a product fault.

## Style

Prose in the UI is plain English, written for someone who is not technical.
Say what a thing does and what it costs. Where a tool has a real limitation —
redaction versus covering text, GIF file sizes, what an ATS parser will choke
on — state it once, clearly, without nagging or moralising.

Commits explain *why*, especially where a decision looks odd or a bug was
subtle. Prefer British spelling in user-facing copy.
