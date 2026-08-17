import { DEFAULT_STYLE, pageSetup, type Block, type DocumentSpec, type Inline } from "../doc/model";
import {
  amountInWords,
  DOCUMENT_LABELS,
  formatMoney,
  invoiceTotals,
  lineTotals,
  type InvoiceDoc,
} from "./model";

/**
 * Renders an invoice to document blocks.
 *
 * Laid out the way Indian tax invoices are expected to look — supplier and
 * customer side by side, a rate-wise tax summary, the total spelled out —
 * because a document that adds up correctly but looks unfamiliar still gets
 * queried by whoever has to process it.
 */

const GREY = { r: 0.42, g: 0.4, b: 0.38 };
const LINE = { r: 0.85, g: 0.84, b: 0.83 };

const text = (t: string, extra: Partial<Inline> = {}): Inline => ({ text: t, ...extra });

/** Splits an address block into inline runs with line breaks preserved. */
function addressLines(value: string): Inline[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line, i) => (i === 0 ? [text(line)] : [text(`\n${line}`)]));
}

function partyCell(
  heading: string,
  party: InvoiceDoc["from"],
  accent: InvoiceDoc extends never ? never : { r: number; g: number; b: number },
): Inline[] {
  const runs: Inline[] = [
    text(`${heading}\n`, { bold: true, size: 8.5, colour: accent }),
    text(`${party.name || "—"}\n`, { bold: true }),
  ];

  for (const line of party.address.split("\n").map((l) => l.trim()).filter(Boolean)) {
    runs.push(text(`${line}\n`, { size: 9, colour: GREY }));
  }
  if (party.gstin) runs.push(text(`GSTIN: ${party.gstin}\n`, { size: 9 }));
  if (party.state) runs.push(text(`${party.state}\n`, { size: 9, colour: GREY }));
  if (party.email) runs.push(text(`${party.email}\n`, { size: 9, colour: GREY }));
  if (party.phone) runs.push(text(`${party.phone}`, { size: 9, colour: GREY }));

  return runs;
}

export function buildInvoiceDocument(doc: InvoiceDoc): DocumentSpec {
  const totals = invoiceTotals(doc);
  const label = DOCUMENT_LABELS[doc.kind];
  const accent = DEFAULT_STYLE.accent;
  const cash = (value: number) => formatMoney(value, doc.currencySymbol, doc.currency);

  const blocks: Block[] = [];

  /* ------------------------------------------------------------ heading */
  blocks.push({
    type: "table",
    columns: [{ width: 1 }, { width: 1 }],
    cellPadding: 0,
    rows: [
      [
        [text(doc.from.name || "Your Business", { bold: true, size: 15 })],
        [
          text(`${label.title}\n`, { bold: true, size: 20, colour: accent }),
          text(`${doc.number || "—"}\n`, { size: 10 }),
          text(`Date: ${doc.date}`, { size: 9, colour: GREY }),
          ...(doc.dueDate ? [text(`\nDue: ${doc.dueDate}`, { size: 9, colour: GREY })] : []),
        ],
      ],
    ],
    after: 10,
  });

  blocks.push({ type: "rule", colour: accent, thickness: 1.5, after: 12 });

  /* ------------------------------------------------------------- parties */
  blocks.push({
    type: "table",
    columns: [{ width: 1 }, { width: 1 }],
    cellPadding: 0,
    rows: [
      [
        partyCell("FROM", doc.from, accent),
        partyCell(doc.kind === "receipt" ? "RECEIVED FROM" : "BILL TO", doc.to, accent),
      ],
    ],
    after: 6,
  });

  if (doc.taxMode === "gst" && doc.placeOfSupply) {
    blocks.push({
      type: "paragraph",
      runs: [text(`Place of supply: ${doc.placeOfSupply}`, { size: 9, colour: GREY })],
      after: 10,
    });
  } else {
    blocks.push({ type: "spacer", height: 10 });
  }

  /* --------------------------------------------------------------- items */
  const showHsn = doc.taxMode === "gst" && doc.items.some((i) => i.hsn.trim());
  const showDiscount = doc.items.some((i) => i.discount > 0);
  const showTax = doc.taxMode !== "none";

  const columns = [
    { width: 20, fixed: true, align: "right" as const },
    { width: 3 },
    ...(showHsn ? [{ width: 1, align: "left" as const }] : []),
    { width: 0.8, align: "right" as const },
    { width: 1, align: "right" as const },
    ...(showDiscount ? [{ width: 0.7, align: "right" as const }] : []),
    ...(showTax ? [{ width: 0.6, align: "right" as const }] : []),
    { width: 1.2, align: "right" as const },
  ];

  const header: Inline[][] = [
    [text("#", { bold: true, size: 9 })],
    [text("Description", { bold: true, size: 9 })],
    ...(showHsn ? [[text("HSN/SAC", { bold: true, size: 9 })]] : []),
    [text("Qty", { bold: true, size: 9 })],
    [text("Rate", { bold: true, size: 9 })],
    ...(showDiscount ? [[text("Disc", { bold: true, size: 9 })]] : []),
    ...(showTax ? [[text("Tax", { bold: true, size: 9 })]] : []),
    [text("Amount", { bold: true, size: 9 })],
  ];

  const rows: Inline[][][] = [header];

  doc.items.forEach((item, index) => {
    const line = lineTotals(item, doc.taxMode, doc.flatTaxRate);
    const rate =
      doc.taxMode === "single" ? doc.flatTaxRate : doc.taxMode === "gst" ? item.taxRate : 0;

    rows.push([
      [text(String(index + 1), { size: 9, colour: GREY })],
      [
        text(item.description || "—"),
        ...(item.unit ? [text(`\n${item.unit}`, { size: 8.5, colour: GREY })] : []),
      ],
      ...(showHsn ? [[text(item.hsn || "—", { size: 9 })]] : []),
      [text(String(item.quantity), { size: 9.5 })],
      [text(cash(item.rate), { size: 9.5 })],
      ...(showDiscount ? [[text(item.discount ? `${item.discount}%` : "—", { size: 9.5 })]] : []),
      ...(showTax ? [[text(`${rate}%`, { size: 9.5 })]] : []),
      [text(cash(line.taxable), { size: 9.5 })],
    ]);
  });

  blocks.push({
    type: "table",
    columns,
    rows,
    headerRow: true,
    rowLines: true,
    lineColour: LINE,
    cellPadding: 5,
    after: 10,
  });

  /* -------------------------------------------------------------- totals */
  const totalRows: Array<[string, string, boolean?]> = [
    ["Subtotal", cash(totals.subtotal)],
  ];
  if (totals.discountTotal > 0) totalRows.push(["Discount", `-${cash(totals.discountTotal)}`]);
  if (totals.discountTotal > 0) totalRows.push(["Taxable value", cash(totals.taxable)]);

  if (doc.taxMode === "gst" && totals.taxTotal > 0) {
    if (totals.intraState) {
      totalRows.push(["CGST", cash(totals.cgst)]);
      totalRows.push(["SGST", cash(totals.sgst)]);
    } else {
      totalRows.push(["IGST", cash(totals.igst)]);
    }
  } else if (doc.taxMode === "single" && totals.taxTotal > 0) {
    totalRows.push([`${doc.taxLabel} (${doc.flatTaxRate}%)`, cash(totals.taxTotal)]);
  }

  if (totals.roundOff !== 0) totalRows.push(["Rounding", cash(totals.roundOff)]);
  totalRows.push([doc.kind === "receipt" ? "Amount paid" : "Total", cash(totals.total), true]);

  blocks.push({
    type: "table",
    columns: [{ width: 1.9 }, { width: 1, align: "right" }],
    cellPadding: 3,
    rows: totalRows.map(([labelText, value, strong]) => [
      [text(labelText, { bold: strong, size: strong ? 11 : 9.5, colour: strong ? undefined : GREY })],
      [text(value, { bold: strong, size: strong ? 12 : 9.5, colour: strong ? accent : undefined })],
    ]),
    after: 8,
  });

  if (doc.showAmountInWords) {
    blocks.push({
      type: "paragraph",
      runs: [
        text("In words: ", { bold: true, size: 9 }),
        text(amountInWords(totals.total, doc.currency, doc.currency === "INR"), {
          size: 9,
        }),
      ],
      after: 10,
    });
  }

  /* -------------------------------------------------- rate-wise tax table */
  if (doc.taxMode === "gst" && totals.byRate.length > 0 && totals.taxTotal > 0) {
    blocks.push({
      type: "table",
      columns: [
        { width: 1 },
        { width: 1.2, align: "right" },
        ...(totals.intraState
          ? [{ width: 1, align: "right" as const }, { width: 1, align: "right" as const }]
          : [{ width: 1, align: "right" as const }]),
      ],
      headerRow: true,
      rowLines: true,
      lineColour: LINE,
      cellPadding: 4,
      rows: [
        [
          [text("Tax rate", { bold: true, size: 8.5 })],
          [text("Taxable value", { bold: true, size: 8.5 })],
          ...(totals.intraState
            ? [[text("CGST", { bold: true, size: 8.5 })], [text("SGST", { bold: true, size: 8.5 })]]
            : [[text("IGST", { bold: true, size: 8.5 })]]),
        ],
        ...totals.byRate.map((row) => [
          [text(`${row.rate}%`, { size: 8.5 })],
          [text(cash(row.taxable), { size: 8.5 })],
          ...(totals.intraState
            ? [[text(cash(row.cgst), { size: 8.5 })], [text(cash(row.sgst), { size: 8.5 })]]
            : [[text(cash(row.igst), { size: 8.5 })]]),
        ]),
      ],
      after: 12,
    });
  }

  /* ------------------------------------------------------ payment + notes */
  const footer: Block[] = [];

  if (doc.bankDetails.trim() || doc.upiId.trim()) {
    footer.push({
      type: "paragraph",
      runs: [text("Payment details", { bold: true, size: 9.5 })],
      after: 2,
    });
    if (doc.bankDetails.trim()) {
      footer.push({
        type: "paragraph",
        runs: addressLines(doc.bankDetails).map((r) => ({ ...r, size: 9, colour: GREY })),
        after: 3,
      });
    }
    if (doc.upiId.trim()) {
      footer.push({
        type: "paragraph",
        runs: [text(`UPI: ${doc.upiId}`, { size: 9, colour: GREY })],
        after: 8,
      });
    }
  }

  if (doc.terms.trim()) {
    footer.push({
      type: "paragraph",
      runs: [text("Terms", { bold: true, size: 9.5 })],
      after: 2,
    });
    footer.push({
      type: "paragraph",
      runs: addressLines(doc.terms).map((r) => ({ ...r, size: 9, colour: GREY })),
      after: 8,
    });
  }

  if (doc.notes.trim()) {
    footer.push({
      type: "paragraph",
      runs: addressLines(doc.notes).map((r) => ({ ...r, size: 9, colour: GREY })),
      after: 8,
    });
  }

  if (footer.length > 0) {
    blocks.push({ type: "rule", colour: LINE, before: 4, after: 8 });
    blocks.push({ type: "keepTogether", blocks: footer });
  }

  return {
    page: pageSetup("a4", 46),
    style: { ...DEFAULT_STYLE, baseSize: 10, lineHeight: 1.3 },
    blocks,
    title: `${label.noun} ${doc.number}`,
    author: doc.from.name || undefined,
  };
}
