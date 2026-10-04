import { createCanvas } from "@napi-rs/canvas";
import jsQR from "jsqr";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { setFontLoader } from "../doc/fonts";
import { renderDocument } from "../doc/render";
import { emptyItem, invoiceTotals, sampleInvoice, type InvoiceDoc } from "./model";
import { buildInvoiceDocument } from "./template";

/**
 * The invoice, built and read back with pdf.js. The arithmetic is covered in
 * model.test.ts; this checks that the right numbers reach the page and that
 * rupee amounts survive — the whole reason the font work happened.
 */

const FONT_DIR = join(process.cwd(), "public", "fonts");

beforeAll(() => {
  setFontLoader(async (name) => new Uint8Array(await readFile(join(FONT_DIR, name))));
});

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
const getPdfjs = () => (pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs"));

async function textOf(doc: InvoiceDoc): Promise<string> {
  const { bytes } = await renderDocument(buildInvoiceDocument(doc));
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const parsed = await task.promise;

  let out = "";
  for (let i = 1; i <= parsed.numPages; i++) {
    const page = await parsed.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    page.cleanup();
  }
  await task.destroy();
  return out;
}

/**
 * Rasterises page one and reads any QR code on it, the way a phone camera
 * would. Proves the printed code scans, not just that something was drawn.
 */
async function scanPage(doc: InvoiceDoc): Promise<string | null> {
  const { bytes } = await renderDocument(buildInvoiceDocument(doc));
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const parsed = await task.promise;
  const page = await parsed.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
    canvas: canvas as unknown as HTMLCanvasElement,
  }).promise;

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  await task.destroy();
  return jsQR(new Uint8ClampedArray(data), canvas.width, canvas.height)?.data ?? null;
}

const withUpi = (over: Partial<InvoiceDoc> = {}): InvoiceDoc => ({
  ...sampleInvoice(),
  upiId: "meridian@okaxis",
  ...over,
  from: { ...sampleInvoice().from, name: "Meridian Studio" },
});

/** Font changes split runs, so compare with whitespace collapsed. */
const squash = (s: string) => s.replace(/\s+/g, "");

describe("invoice rendering", () => {
  it("puts the essentials on the page", async () => {
    const doc = sampleInvoice();
    doc.from.name = "Meridian Studio";
    doc.to.name = "Kestrel Supply Co.";
    doc.number = "INV-2026-014";

    const text = await textOf(doc);
    expect(text).toContain("TAX INVOICE");
    expect(text).toContain("INV-2026-014");
    expect(text).toContain("Meridian Studio");
    expect(text).toContain("Kestrel Supply Co.");
    expect(text).toContain("Design and development work");
  });

  it("keeps rupee amounts with Indian digit grouping", async () => {
    const doc = sampleInvoice();
    doc.items = [{ ...emptyItem(18), description: "Retainer", rate: 120000, quantity: 1 }];

    const text = squash(await textOf(doc));
    // 1,20,000 rather than 120,000 — and the ₹ must survive at all.
    expect(text).toContain("₹1,20,000.00");
    expect(text).not.toContain("₹120,000.00");
  });

  it("labels CGST and SGST within one state", async () => {
    const doc = sampleInvoice();
    doc.from.state = "Karnataka";
    doc.placeOfSupply = "Karnataka";

    const text = await textOf(doc);
    expect(text).toContain("CGST");
    expect(text).toContain("SGST");
    expect(text).not.toContain("IGST");
  });

  it("labels IGST across states", async () => {
    const doc = sampleInvoice();
    doc.from.state = "Karnataka";
    doc.placeOfSupply = "Maharashtra";

    const text = await textOf(doc);
    expect(text).toContain("IGST");
    expect(text).not.toContain("CGST");
  });

  it("writes the total out in words, the Indian way", async () => {
    const doc = sampleInvoice();
    doc.items = [{ ...emptyItem(0), description: "Consulting", rate: 120000, quantity: 1 }];
    doc.taxMode = "none";
    doc.showAmountInWords = true;

    const text = await textOf(doc);
    expect(text).toContain("One Lakh Twenty Thousand");
    expect(text).not.toContain("One Hundred and Twenty Thousand");
  });

  it("shows the HSN column only when codes are filled in", async () => {
    const without = sampleInvoice();
    without.items = [{ ...emptyItem(18), description: "Work", hsn: "", rate: 100 }];
    expect(await textOf(without)).not.toContain("HSN/SAC");

    const with_ = sampleInvoice();
    with_.items = [{ ...emptyItem(18), description: "Work", hsn: "998314", rate: 100 }];
    const text = await textOf(with_);
    expect(text).toContain("HSN/SAC");
    expect(text).toContain("998314");
  });

  it("renames itself for a receipt", async () => {
    const doc = sampleInvoice("receipt");
    const text = await textOf(doc);
    expect(text).toContain("RECEIPT");
    expect(text).toContain("Amount paid");
  });

  it("renders an empty document without falling over", async () => {
    const doc = sampleInvoice();
    doc.items = [];
    const text = await textOf(doc);
    expect(text).toContain("TAX INVOICE");
  });

  it("flows a long bill onto more than one page without losing items", async () => {
    const doc = sampleInvoice();
    doc.items = Array.from({ length: 45 }, (_, i) => ({
      ...emptyItem(18),
      description: `Line item number ${i + 1}`,
      rate: 1000 + i,
    }));

    const { pageCount } = await renderDocument(buildInvoiceDocument(doc));
    expect(pageCount).toBeGreaterThan(1);

    const text = await textOf(doc);
    expect(text).toContain("Line item number 1 ");
    expect(text).toContain("Line item number 45");
  });

  describe("scan to pay", () => {
    it("prints the QR with the bill's total beside it", async () => {
      const text = squash(await textOf(withUpi()));
      // 50,000 + 18% GST.
      expect(text).toContain("Scantopay₹59,000.00");
      expect(text).toContain("UPI:meridian@okaxis");
    });

    it("scans to a payment for exactly the total on the bill", async () => {
      const doc = withUpi({ number: "INV-042" });
      doc.items = [
        { ...emptyItem(18), description: "Design", rate: 12345.67 },
        { ...emptyItem(5), description: "Prints", rate: 800, quantity: 3 },
      ];
      const { total } = invoiceTotals(doc);

      const decoded = await scanPage(doc);
      expect(decoded).not.toBeNull();
      expect(decoded).toBe(
        `upi://pay?pa=meridian%40okaxis&pn=Meridian%20Studio&am=${total.toFixed(2)}` +
          "&cu=INR&tn=Invoice%20INV-042",
      );
    });

    it("leaves the QR off a receipt, which is already paid", async () => {
      const doc = withUpi({ kind: "receipt" });
      expect(await textOf(doc)).not.toContain("Scan to pay");
      expect(await scanPage(doc)).toBeNull();
    });

    it("leaves it off when switched off, but keeps the UPI ID", async () => {
      const text = await textOf(withUpi({ showUpiQr: false }));
      expect(text).not.toContain("Scan to pay");
      expect(text).toContain("meridian@okaxis");
    });

    it("leaves it off for a mistyped UPI ID rather than print a code that fails", async () => {
      const doc = withUpi({ upiId: "meridian.okaxis" });
      expect(await textOf(doc)).not.toContain("Scan to pay");
      expect(await scanPage(doc)).toBeNull();
    });

    it("leaves it off for other currencies, since UPI is rupees only", async () => {
      const doc = withUpi({ currency: "USD", currencySymbol: "$" });
      expect(await textOf(doc)).not.toContain("Scan to pay");
    });
  });
});
