import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { invoiceTotals, sampleInvoice } from "./model";
import { buildUpiPayUri, invoiceUpiUri, validateUpiId, wantsUpiQr } from "./upi";

/** Reads a `upi://pay` link's parameters the way a UPI app would. */
function params(uri: string): Record<string, string> {
  expect(uri.startsWith("upi://pay?")).toBe(true);
  const out: Record<string, string> = {};
  for (const pair of uri.slice("upi://pay?".length).split("&")) {
    const [k, v] = pair.split("=");
    out[k] = decodeURIComponent(v);
  }
  return out;
}

/** Renders to real pixels and decodes with an independent reader. */
function scan(text: string): string | null {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { data, size } = qr.modules;
  const scale = 4;
  const dim = (size + 8) * scale;
  const rgba = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + 4) * scale + dy) * dim + (x + 4) * scale + dx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
      }
    }
  }
  return jsQR(rgba, dim, dim)?.data ?? null;
}

describe("validateUpiId", () => {
  it("accepts the usual shapes", () => {
    expect(validateUpiId("meridian.studio@okaxis")).toBeNull();
    expect(validateUpiId("9876543210@ybl")).toBeNull();
    expect(validateUpiId("  shop-name_1@paytm ")).toBeNull();
  });

  it("treats empty as fine, since UPI is optional", () => {
    expect(validateUpiId("")).toBeNull();
  });

  it("rejects things that are not UPI IDs", () => {
    expect(validateUpiId("meridian.studio")).toMatch(/@/);
    expect(validateUpiId("a@b")).not.toBeNull();
    expect(validateUpiId("name@@okaxis")).not.toBeNull();
    expect(validateUpiId("my name@okaxis")).not.toBeNull();
  });
});

describe("buildUpiPayUri", () => {
  const base = {
    upiId: "meridian@okaxis",
    payeeName: "Meridian Studio",
    amount: 59000,
    note: "Invoice INV-001",
  };

  it("builds the exact link UPI apps expect", () => {
    expect(buildUpiPayUri(base)).toBe(
      "upi://pay?pa=meridian%40okaxis&pn=Meridian%20Studio&am=59000.00&cu=INR&tn=Invoice%20INV-001",
    );
  });

  it("always writes the amount with two decimals", () => {
    expect(params(buildUpiPayUri({ ...base, amount: 1234.5 })).am).toBe("1234.50");
    expect(params(buildUpiPayUri({ ...base, amount: 0.1 + 0.2 })).am).toBe("0.30");
  });

  it("encodes awkward names rather than breaking the link", () => {
    const p = params(buildUpiPayUri({ ...base, payeeName: "Rao & Sons = Best?" }));
    expect(p.pn).toBe("Rao & Sons = Best?");
    expect(p.am).toBe("59000.00");
  });

  it("never writes a space as +, which some apps show literally", () => {
    expect(buildUpiPayUri(base)).not.toContain("+");
  });

  it("keeps the note short enough for fussy bank apps", () => {
    expect(params(buildUpiPayUri({ ...base, note: "x".repeat(200) })).tn).toHaveLength(50);
  });

  it("gives nothing when there is nothing to pay or nowhere to pay it", () => {
    expect(buildUpiPayUri({ ...base, amount: 0 })).toBe("");
    expect(buildUpiPayUri({ ...base, amount: -5 })).toBe("");
    expect(buildUpiPayUri({ ...base, amount: Number.NaN })).toBe("");
    expect(buildUpiPayUri({ ...base, upiId: "" })).toBe("");
    expect(buildUpiPayUri({ ...base, upiId: "not-an-id" })).toBe("");
  });

  it("scans back to the same link, with the amount intact", () => {
    const uri = buildUpiPayUri({ ...base, amount: 118000 });
    const decoded = scan(uri);
    expect(decoded).toBe(uri);
    expect(params(decoded!)).toMatchObject({
      pa: "meridian@okaxis",
      am: "118000.00",
      cu: "INR",
    });
  });
});

describe("invoice payment link", () => {
  const ready = () => {
    const doc = sampleInvoice();
    doc.upiId = "meridian@okaxis";
    doc.from.name = "Meridian Studio";
    doc.number = "INV-007";
    return doc;
  };

  it("asks for exactly the bill's total, GST and rounding included", () => {
    const doc = ready();
    doc.items[0].rate = 999.99;
    const { total } = invoiceTotals(doc);
    expect(total).toBe(1180); // 999.99 + 18% = 1179.99, rounded off
    const p = params(invoiceUpiUri(doc, total, "Invoice"));
    expect(p.am).toBe("1180.00");
    expect(p.tn).toBe("Invoice INV-007");
    expect(p.pn).toBe("Meridian Studio");
  });

  it("keeps the paise when rounding is off", () => {
    const doc = ready();
    doc.roundOff = false;
    doc.items[0].rate = 999.99;
    const { total } = invoiceTotals(doc);
    expect(params(invoiceUpiUri(doc, total, "Invoice")).am).toBe("1179.99");
  });

  it("is left off receipts, other currencies, and when switched off", () => {
    const total = 1000;
    expect(wantsUpiQr(ready(), total)).toBe(true);
    expect(wantsUpiQr({ ...ready(), kind: "receipt" }, total)).toBe(false);
    expect(wantsUpiQr({ ...ready(), currency: "USD" }, total)).toBe(false);
    expect(wantsUpiQr({ ...ready(), showUpiQr: false }, total)).toBe(false);
    expect(wantsUpiQr({ ...ready(), upiId: "oops" }, total)).toBe(false);
    expect(wantsUpiQr(ready(), 0)).toBe(false);
  });

  it("is on for drafts saved before the option existed", () => {
    const old = ready();
    delete old.showUpiQr;
    expect(wantsUpiQr(old, 1000)).toBe(true);
  });
});
