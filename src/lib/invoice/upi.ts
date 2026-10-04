import type { InvoiceDoc } from "./model";

/**
 * The "scan to pay" link printed on a bill.
 *
 * UPI apps (GPay, PhonePe, Paytm, BHIM and every bank's own) all read the
 * same `upi://pay?…` deep link from a QR code. Putting the amount in it means
 * the customer pays exactly this bill's total rather than typing a number
 * and getting it wrong.
 */

/** A UPI ID is `handle@provider`, for example `shop.name@okaxis`. */
const UPI_ID = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,64}$/i;

/** Some bank apps refuse a payment whose note is longer than this. */
const NOTE_LIMIT = 50;

export function validateUpiId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.includes("@")) return "A UPI ID has an @ in it, like yourname@okaxis.";
  if (!UPI_ID.test(trimmed)) return "That doesn't look like a valid UPI ID.";
  return null;
}

export interface UpiPayment {
  upiId: string;
  payeeName: string;
  amount: number;
  note: string;
}

/**
 * Builds the `upi://pay` link, or "" when there is nothing payable.
 *
 * Every value goes through `encodeURIComponent` rather than URLSearchParams,
 * because the latter writes spaces as `+` and several UPI apps show that `+`
 * literally in the payee name. The amount is always two decimals: some apps
 * reject `59000` and want `59000.00`.
 */
export function buildUpiPayUri({ upiId, payeeName, amount, note }: UpiPayment): string {
  const id = upiId.trim();
  if (!id || validateUpiId(id) || !(amount > 0)) return "";

  const params: Array<[string, string]> = [["pa", id]];
  const name = payeeName.trim();
  if (name) params.push(["pn", name]);
  params.push(["am", amount.toFixed(2)], ["cu", "INR"]);
  const trimmedNote = note.trim().slice(0, NOTE_LIMIT).trim();
  if (trimmedNote) params.push(["tn", trimmedNote]);

  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

/**
 * Whether this document should carry a scan-to-pay code at all.
 *
 * UPI is rupees only, a receipt is already paid, and a zero bill has nothing
 * to collect. Older saved drafts have no `showUpiQr` field, so missing counts
 * as on.
 */
export function wantsUpiQr(doc: InvoiceDoc, total: number): boolean {
  return (
    doc.showUpiQr !== false &&
    doc.currency === "INR" &&
    doc.kind !== "receipt" &&
    total > 0 &&
    doc.upiId.trim() !== "" &&
    validateUpiId(doc.upiId) === null
  );
}

/** The payment link for a whole bill, matching its printed total. */
export function invoiceUpiUri(doc: InvoiceDoc, total: number, noun: string): string {
  if (!wantsUpiQr(doc, total)) return "";
  return buildUpiPayUri({
    upiId: doc.upiId,
    payeeName: doc.from.name,
    amount: total,
    note: `${noun} ${doc.number}`.trim(),
  });
}
