import { describe, expect, it } from "vitest";
import {
  amountInWords,
  emptyItem,
  formatMoney,
  invoiceTotals,
  isIntraState,
  lineTotals,
  numberToIndianWords,
  numberToWesternWords,
  sampleInvoice,
  validateGstin,
  type InvoiceDoc,
  type LineItem,
} from "./model";

/**
 * Invoice arithmetic is the sort of thing that looks right and is wrong by a
 * rupee, so it is pinned down here. The GST split matters most: putting the
 * correct total in the wrong boxes costs the recipient their input tax credit.
 */

const item = (over: Partial<LineItem> = {}): LineItem => ({
  ...emptyItem(),
  description: "Work",
  quantity: 1,
  rate: 1000,
  discount: 0,
  taxRate: 18,
  ...over,
});

const doc = (over: Partial<InvoiceDoc> = {}): InvoiceDoc => ({
  ...sampleInvoice(),
  items: [item()],
  roundOff: false,
  ...over,
});

describe("line totals", () => {
  it("multiplies quantity by rate", () => {
    expect(lineTotals(item({ quantity: 3, rate: 250 }), "none", 0).taxable).toBe(750);
  });

  it("applies a percentage discount before tax", () => {
    const totals = lineTotals(item({ rate: 1000, discount: 10 }), "gst", 0);
    expect(totals.discountAmount).toBe(100);
    expect(totals.taxable).toBe(900);
    // Tax is charged on the discounted amount, not the original.
    expect(totals.taxAmount).toBe(162);
    expect(totals.total).toBe(1062);
  });

  it("charges no tax when the mode is none", () => {
    expect(lineTotals(item({ taxRate: 18 }), "none", 0).taxAmount).toBe(0);
  });

  it("uses the flat rate in single-tax mode, ignoring the line's own", () => {
    expect(lineTotals(item({ taxRate: 28 }), "single", 5).taxAmount).toBe(50);
  });

  it("rounds to two decimals without floating-point drift", () => {
    const totals = lineTotals(item({ quantity: 3, rate: 33.33 }), "none", 0);
    expect(totals.taxable).toBe(99.99);
  });
});

describe("GST split", () => {
  it("splits into CGST and SGST within one state", () => {
    const totals = invoiceTotals(
      doc({
        from: { ...sampleInvoice().from, state: "Karnataka" },
        placeOfSupply: "Karnataka",
      }),
    );
    expect(totals.intraState).toBe(true);
    expect(totals.cgst).toBe(90);
    expect(totals.sgst).toBe(90);
    expect(totals.igst).toBe(0);
    expect(totals.taxTotal).toBe(180);
  });

  it("charges IGST across states", () => {
    const totals = invoiceTotals(
      doc({
        from: { ...sampleInvoice().from, state: "Karnataka" },
        placeOfSupply: "Maharashtra",
      }),
    );
    expect(totals.intraState).toBe(false);
    expect(totals.igst).toBe(180);
    expect(totals.cgst).toBe(0);
    expect(totals.sgst).toBe(0);
  });

  it("gives the same total either way — only the boxes change", () => {
    const intra = invoiceTotals(doc({ placeOfSupply: "Karnataka" }));
    const inter = invoiceTotals(doc({ placeOfSupply: "Maharashtra" }));
    expect(intra.total).toBe(inter.total);
    expect(intra.taxTotal).toBe(inter.taxTotal);
  });

  it("isn't fooled by casing or stray spaces", () => {
    // A trailing space must not silently switch the invoice to IGST.
    expect(
      isIntraState(
        doc({
          from: { ...sampleInvoice().from, state: "  karnataka " },
          placeOfSupply: "Karnataka",
        }),
      ),
    ).toBe(true);
  });

  it("falls back to the customer's state when no place of supply is set", () => {
    expect(
      isIntraState(
        doc({
          placeOfSupply: "",
          from: { ...sampleInvoice().from, state: "Kerala" },
          to: { ...sampleInvoice().to, state: "Tamil Nadu" },
        }),
      ),
    ).toBe(false);
  });

  it("splits an odd tax amount without losing a paisa", () => {
    // 18% of 1234.55 is 222.219, which cannot be halved evenly.
    const totals = invoiceTotals(doc({ items: [item({ rate: 1234.55 })] }));
    expect(totals.cgst + totals.sgst).toBeCloseTo(totals.taxTotal, 2);
  });
});

describe("tax summary by rate", () => {
  it("groups lines that share a rate", () => {
    const totals = invoiceTotals(
      doc({
        items: [
          item({ rate: 1000, taxRate: 18 }),
          item({ rate: 2000, taxRate: 18 }),
          item({ rate: 500, taxRate: 5 }),
        ],
      }),
    );

    expect(totals.byRate).toHaveLength(2);
    const eighteen = totals.byRate.find((r) => r.rate === 18)!;
    expect(eighteen.taxable).toBe(3000);
    expect(eighteen.cgst + eighteen.sgst).toBeCloseTo(540, 2);
  });

  it("orders rates ascending", () => {
    const totals = invoiceTotals(
      doc({
        items: [item({ taxRate: 28 }), item({ taxRate: 5 }), item({ taxRate: 12 })],
      }),
    );
    expect(totals.byRate.map((r) => r.rate)).toEqual([5, 12, 28]);
  });
});

describe("rounding", () => {
  it("rounds the total and records the adjustment", () => {
    const totals = invoiceTotals(doc({ items: [item({ rate: 999.4 })], roundOff: true }));
    expect(Number.isInteger(totals.total)).toBe(true);
    // The adjustment plus the unrounded total must equal the rounded one.
    expect(totals.total - totals.roundOff).toBeCloseTo(
      totals.taxable + totals.taxTotal,
      2,
    );
  });

  it("leaves the total alone when rounding is off", () => {
    const totals = invoiceTotals(doc({ items: [item({ rate: 999.4 })], roundOff: false }));
    expect(totals.roundOff).toBe(0);
    expect(totals.total).toBeCloseTo(totals.taxable + totals.taxTotal, 2);
  });
});

describe("Indian number words", () => {
  it("uses lakh and crore rather than the international grouping", () => {
    expect(numberToIndianWords(120_000)).toBe("One Lakh Twenty Thousand");
    expect(numberToIndianWords(100_000)).toBe("One Lakh");
    expect(numberToIndianWords(10_000_000)).toBe("One Crore");
    expect(numberToIndianWords(12_345_678)).toContain("Crore");
  });

  it("handles the small cases", () => {
    expect(numberToIndianWords(0)).toBe("Zero");
    expect(numberToIndianWords(7)).toBe("Seven");
    expect(numberToIndianWords(15)).toBe("Fifteen");
    expect(numberToIndianWords(42)).toBe("Forty Two");
    expect(numberToIndianWords(105)).toBe("One Hundred and Five");
  });

  it("crosses the lakh and crore boundaries correctly", () => {
    expect(numberToIndianWords(99_999)).toBe("Ninety Nine Thousand Nine Hundred and Ninety Nine");
    expect(numberToIndianWords(1_00_001)).toBe("One Lakh One");
    expect(numberToIndianWords(1_00_00_001)).toBe("One Crore One");
  });

  it("differs from the international system, as it should", () => {
    expect(numberToWesternWords(120_000)).toBe("One Hundred and Twenty Thousand");
    expect(numberToIndianWords(120_000)).not.toBe(numberToWesternWords(120_000));
  });
});

describe("amountInWords", () => {
  it("names the currency and its subunit", () => {
    expect(amountInWords(1200.5, "INR", true)).toBe(
      "Rupees One Thousand Two Hundred and Fifty Paise Only",
    );
    expect(amountInWords(45, "USD", false)).toBe("Dollars Forty Five Only");
  });

  it("omits the fraction when it's zero", () => {
    expect(amountInWords(500, "INR", true)).toBe("Rupees Five Hundred Only");
  });

  it("handles zero", () => {
    expect(amountInWords(0, "INR", true)).toBe("Rupees Zero Only");
  });
});

describe("formatMoney", () => {
  it("uses Indian digit grouping for rupees", () => {
    // 1,20,000 rather than 120,000 — the wrong one reads as an error.
    expect(formatMoney(120000, "₹", "INR")).toBe("₹1,20,000.00");
    expect(formatMoney(120000, "$", "USD")).toBe("$120,000.00");
  });

  it("always shows two decimals", () => {
    expect(formatMoney(5, "₹", "INR")).toBe("₹5.00");
  });

  it("puts the minus before the symbol", () => {
    expect(formatMoney(-250, "₹", "INR")).toBe("-₹250.00");
  });
});

describe("validateGstin", () => {
  it("accepts a well-formed GSTIN", () => {
    expect(validateGstin("29ABCDE1234F1Z5")).toBeNull();
  });

  it("says nothing when the field is empty", () => {
    expect(validateGstin("")).toBeNull();
    expect(validateGstin("   ")).toBeNull();
  });

  it("catches the wrong length", () => {
    expect(validateGstin("29ABCDE1234F1Z")).toContain("15 characters");
  });

  it("catches a malformed one of the right length", () => {
    expect(validateGstin("XXABCDE1234F1Z5")).toContain("doesn't look like");
  });

  it("ignores casing and surrounding spaces", () => {
    expect(validateGstin(" 29abcde1234f1z5 ")).toBeNull();
  });
});

describe("whole invoice", () => {
  it("adds up a realistic multi-line bill", () => {
    const totals = invoiceTotals(
      doc({
        roundOff: true,
        items: [
          item({ description: "Design", quantity: 12, rate: 2500, taxRate: 18 }),
          item({ description: "Hosting", quantity: 1, rate: 6000, discount: 10, taxRate: 18 }),
        ],
      }),
    );

    expect(totals.subtotal).toBe(36000);
    expect(totals.discountTotal).toBe(600);
    expect(totals.taxable).toBe(35400);
    expect(totals.taxTotal).toBe(6372);
    expect(totals.total).toBe(41772);
  });

  it("copes with no items at all", () => {
    const totals = invoiceTotals(doc({ items: [] }));
    expect(totals.subtotal).toBe(0);
    expect(totals.total).toBe(0);
    expect(totals.byRate).toEqual([]);
  });
});
