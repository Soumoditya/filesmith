import { PDFDocument, rgb } from "@cantoo/pdf-lib";
import { buildFontStack } from "./fonts";
import type { FontStack } from "./fontStack";
import { checkCoverage, type CoverageWarning } from "./fontStack";
import { collectText, layoutDocument, wrapText, type FontSet } from "./layout";
import type { DocumentSpec, Rgb, RunningText } from "./model";

/**
 * Draws a laid-out document into a real PDF.
 *
 * The output carries genuine, selectable, searchable text — not a rasterised
 * image of text, which is what most free "text to PDF" tools produce and why
 * their output can't be copied out of.
 */

const toRgb = (c: Rgb) => rgb(c.r, c.g, c.b);

class StackSet implements FontSet {
  private readonly stacks: Map<string, FontStack>;

  constructor(stacks: Map<string, FontStack>) {
    this.stacks = stacks;
  }

  get(bold: boolean, italic: boolean): FontStack {
    const weight = bold ? 700 : 400;
    const style = italic ? "italic" : "normal";
    return (
      this.stacks.get(`${weight}-${style}`) ??
      // Not every family ships every combination; upright regular always exists.
      this.stacks.get(`${weight}-normal`) ??
      this.stacks.get("400-normal")!
    );
  }
}

async function loadFontSet(doc: PDFDocument, spec: DocumentSpec): Promise<StackSet> {
  const combos = [
    [400, "normal"],
    [400, "italic"],
    [700, "normal"],
    [700, "italic"],
  ] as const;

  const stacks = new Map<string, FontStack>();

  for (const [weight, style] of combos) {
    try {
      stacks.set(
        `${weight}-${style}`,
        await buildFontStack(doc, spec.style.family, weight, style),
      );
    } catch {
      // A missing italic subset shouldn't lose the document; `get` falls back.
    }
  }

  if (stacks.size === 0) {
    throw new Error("No fonts could be loaded, so the document can't be built.");
  }
  return new StackSet(stacks);
}

export interface RenderResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Problems worth telling the user about before they download. */
  warnings: CoverageWarning[];
}

export async function renderDocument(spec: DocumentSpec): Promise<RenderResult> {
  const doc = await PDFDocument.create();
  const fonts = await loadFontSet(doc, spec);

  const warnings = checkCoverage(fonts.get(false, false), collectText(spec.blocks));

  const laid = layoutDocument(spec, fonts);
  const { margins } = spec.page;

  // Cache embedded images so a logo repeated on every page is stored once.
  const imageCache = new Map<Uint8Array, Awaited<ReturnType<PDFDocument["embedPng"]>>>();

  for (const [pageIndex, page] of laid.pages.entries()) {
    const pdfPage = doc.addPage([spec.page.width, spec.page.height]);

    for (const { drawable, y } of page.items) {
      // Layout works top-down; PDF is bottom-up.
      const top = spec.page.height - margins.top - y;

      switch (drawable.kind) {
        case "line": {
          const baseline = top - drawable.ascent;
          for (const run of drawable.runs) {
            pdfPage.drawText(run.text, {
              x: margins.left + run.x,
              y: baseline,
              size: run.size,
              font: run.face.pdfFont,
              color: toRgb(run.colour),
            });
          }
          break;
        }

        case "rule":
          pdfPage.drawLine({
            start: { x: margins.left + drawable.x, y: top },
            end: { x: margins.left + drawable.x + drawable.width, y: top },
            thickness: drawable.thickness,
            color: toRgb(drawable.colour),
          });
          break;

        case "image": {
          let embedded = imageCache.get(drawable.data);
          if (!embedded) {
            embedded =
              drawable.format === "jpg"
                ? await doc.embedJpg(drawable.data)
                : await doc.embedPng(drawable.data);
            imageCache.set(drawable.data, embedded);
          }
          pdfPage.drawImage(embedded, {
            x: margins.left + drawable.x,
            y: top - drawable.height,
            width: drawable.width,
            height: drawable.height,
          });
          break;
        }

        case "space":
          break;
      }
    }

    await drawRunningText(
      pdfPage,
      spec,
      fonts,
      spec.header,
      pageIndex,
      laid.pages.length,
      true,
    );
    await drawRunningText(
      pdfPage,
      spec,
      fonts,
      spec.footer,
      pageIndex,
      laid.pages.length,
      false,
    );
  }

  if (spec.title) doc.setTitle(spec.title);
  if (spec.author) doc.setAuthor(spec.author);
  doc.setProducer("Filesmith");
  doc.setCreator("Filesmith");

  return { bytes: await doc.save(), pageCount: laid.pages.length, warnings };
}

async function drawRunningText(
  pdfPage: ReturnType<PDFDocument["addPage"]>,
  spec: DocumentSpec,
  fonts: FontSet,
  running: RunningText | undefined,
  pageIndex: number,
  total: number,
  isHeader: boolean,
): Promise<void> {
  if (!running) return;
  if (running.skipFirst && pageIndex === 0) return;

  const text = running.template
    .replace(/\{n\}/g, String(pageIndex + 1))
    .replace(/\{total\}/g, String(total));
  if (!text) return;

  const size = running.size ?? spec.style.baseSize * 0.85;
  const width = spec.page.width - spec.page.margins.left - spec.page.margins.right;
  const colour = running.colour ?? { r: 0.45, g: 0.43, b: 0.41 };

  const [line] = wrapText(
    [{ text, colour }],
    fonts,
    spec.style,
    width,
    size,
    running.align ?? "centre",
    1.2,
  );

  // Sits inside the margin, halfway between the text block and the paper edge.
  const y = isHeader
    ? spec.page.height - spec.page.margins.top / 2 - size / 2
    : spec.page.margins.bottom / 2;

  for (const run of line.runs) {
    pdfPage.drawText(run.text, {
      x: spec.page.margins.left + run.x,
      y,
      size: run.size,
      font: run.face.pdfFont,
      color: toRgb(run.colour),
    });
  }
}
