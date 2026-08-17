/**
 * Invoices, quotations, estimates and receipts — one model, four labels.
 *
 * The tax handling is India-first because that's where the sharpest edges
 * are: getting CGST/SGST versus IGST wrong costs the recipient their input
 * tax credit, and the split depends on where the supply is deemed to happen
 * rather than on anything visible in the line items.
 */

export type DocumentKind = "invoice" | "quotation" | "estimate" | "receipt";

export const DOCUMENT_LABELS: Record<DocumentKind, { title: string; noun: string }> = {
  invoice: { title: "TAX INVOICE", noun: "Invoice" },
  quotation: { title: "QUOTATION", noun: "Quotation" },
  estimate: { title: "ESTIMATE", noun: "Estimate" },
  receipt: { title: "RECEIPT", noun: "Receipt" },
};

export type TaxMode = "none" | "single" | "gst";

export interface Party {
  name: string;
  address: string;
  email: string;
  phone: string;
  /** GST identification number — India only. */
  gstin: string;
  /** State, which decides the CGST/SGST versus IGST split. */
  state: string;
}

export interface LineItem {
  id: string;
  description: string;
  /** HSN for goods, SAC for services. Mandatory on Indian tax invoices. */
  hsn: string;
  quantity: number;
  unit: string;
  rate: number;
  /** Percentage off this line. */
  discount: number;
  /** Tax percentage for this line — GST rates vary per item. */
  taxRate: number;
}

export interface InvoiceDoc {
  kind: DocumentKind;
  number: string;
  date: string;
  dueDate: string;
  /** Where the supply is deemed to happen. Drives the GST split. */
  placeOfSupply: string;
  currency: string;
  currencySymbol: string;
  taxMode: TaxMode;
  /** Used when `taxMode` is `single`. */
  flatTaxRate: number;
  taxLabel: string;
  from: Party;
  to: Party;
  items: LineItem[];
  notes: string;
  terms: string;
  bankDetails: string;
  upiId: string;
  /** Logo as a data URL. */
  logo: string | null;
  /** Print the total spelled out — expected on Indian invoices. */
  showAmountInWords: boolean;
  /** Round the total to the nearest rupee and show the adjustment. */
  roundOff: boolean;
}

export interface LineTotals {
  gross: number;
  discountAmount: number;
  taxable: number;
  taxAmount: number;
  total: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discountTotal: number;
  taxable: number;
  /** Populated when the tax is split across two halves. */
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  /** Difference introduced by rounding, positive or negative. */
  roundOff: number;
  total: number;
  /** Tax broken down by rate, for the summary table Indian invoices need. */
  byRate: Array<{
    rate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>;
  /** True when the split is CGST + SGST rather than IGST. */
  intraState: boolean;
}

/** Rounds to two decimals without the usual floating-point drift. */
export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineTotals(item: LineItem, taxMode: TaxMode, flatRate: number): LineTotals {
  const gross = money(item.quantity * item.rate);
  const discountAmount = money((gross * item.discount) / 100);
  const taxable = money(gross - discountAmount);

  const rate = taxMode === "none" ? 0 : taxMode === "single" ? flatRate : item.taxRate;
  const taxAmount = money((taxable * rate) / 100);

  return { gross, discountAmount, taxable, taxAmount, total: money(taxable + taxAmount) };
}

/**
 * Normalises a state for comparison. People write "Karnataka", "karnataka"
 * and "KA " for the same place, and a stray space must not silently switch an
 * invoice from CGST/SGST to IGST.
 */
function normaliseState(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Works out whether the supply is within one state.
 *
 * Under GST, a supply inside the supplier's own state attracts CGST and SGST
 * at half the rate each; a supply to another state attracts IGST at the full
 * rate. The totals match either way, but putting them in the wrong boxes
 * makes the invoice unusable for the recipient's tax credit.
 */
export function isIntraState(doc: InvoiceDoc): boolean {
  const supplier = normaliseState(doc.from.state);
  const place = normaliseState(doc.placeOfSupply || doc.to.state);
  if (!supplier || !place) return true;
  return supplier === place;
}

export function invoiceTotals(doc: InvoiceDoc): InvoiceTotals {
  const intraState = doc.taxMode === "gst" ? isIntraState(doc) : false;

  let subtotal = 0;
  let discountTotal = 0;
  let taxable = 0;
  let taxTotal = 0;

  const rateMap = new Map<number, { taxable: number; tax: number }>();

  for (const item of doc.items) {
    const totals = lineTotals(item, doc.taxMode, doc.flatTaxRate);
    subtotal += totals.gross;
    discountTotal += totals.discountAmount;
    taxable += totals.taxable;
    taxTotal += totals.taxAmount;

    const rate =
      doc.taxMode === "none" ? 0 : doc.taxMode === "single" ? doc.flatTaxRate : item.taxRate;
    const bucket = rateMap.get(rate) ?? { taxable: 0, tax: 0 };
    bucket.taxable += totals.taxable;
    bucket.tax += totals.taxAmount;
    rateMap.set(rate, bucket);
  }

  subtotal = money(subtotal);
  discountTotal = money(discountTotal);
  taxable = money(taxable);
  taxTotal = money(taxTotal);

  const cgst = intraState ? money(taxTotal / 2) : 0;
  const sgst = intraState ? money(taxTotal - cgst) : 0;
  const igst = intraState ? 0 : taxTotal;

  const beforeRounding = money(taxable + taxTotal);
  const total = doc.roundOff ? Math.round(beforeRounding) : beforeRounding;
  const roundOff = doc.roundOff ? money(total - beforeRounding) : 0;

  const byRate = [...rateMap.entries()]
    .filter(([rate, bucket]) => rate > 0 || bucket.taxable > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([rate, bucket]) => {
      const half = money(bucket.tax / 2);
      return {
        rate,
        taxable: money(bucket.taxable),
        cgst: intraState ? half : 0,
        sgst: intraState ? money(bucket.tax - half) : 0,
        igst: intraState ? 0 : money(bucket.tax),
      };
    });

  return {
    subtotal,
    discountTotal,
    taxable,
    cgst,
    sgst,
    igst,
    taxTotal,
    roundOff,
    total,
    byRate,
    intraState,
  };
}

/* ------------------------------------------------------------ words */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function underThousand(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const rest = n % 10;
    return TENS[Math.floor(n / 10)] + (rest ? ` ${ONES[rest]}` : "");
  }
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` and ${underThousand(rest)}` : ""}`;
}

/**
 * Spells a number the Indian way: thousand, lakh, crore.
 *
 * Not a stylistic choice — Indian invoices are expected to read
 * "One Lakh Twenty Thousand", and "One Hundred and Twenty Thousand" looks
 * wrong to everyone who has to check it.
 */
export function numberToIndianWords(value: number): string {
  const whole = Math.floor(Math.abs(value));
  if (whole === 0) return "Zero";

  const parts: string[] = [];
  const crore = Math.floor(whole / 10_000_000);
  const lakh = Math.floor((whole % 10_000_000) / 100_000);
  const thousand = Math.floor((whole % 100_000) / 1000);
  const rest = whole % 1000;

  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** The international grouping, for invoices not in rupees. */
export function numberToWesternWords(value: number): string {
  const whole = Math.floor(Math.abs(value));
  if (whole === 0) return "Zero";

  const scales = [
    { value: 1_000_000_000, name: "Billion" },
    { value: 1_000_000, name: "Million" },
    { value: 1000, name: "Thousand" },
  ];

  let remaining = whole;
  const parts: string[] = [];

  for (const scale of scales) {
    const count = Math.floor(remaining / scale.value);
    if (count > 0) {
      parts.push(`${numberToWesternWords(count)} ${scale.name}`);
      remaining %= scale.value;
    }
  }

  if (remaining > 0) parts.push(underThousand(remaining));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** The full "Rupees … and … Paise Only" line. */
export function amountInWords(
  value: number,
  currency: string,
  useIndianSystem: boolean,
): string {
  const whole = Math.floor(Math.abs(value));
  const fraction = Math.round((Math.abs(value) - whole) * 100);

  const words = useIndianSystem
    ? numberToIndianWords(whole)
    : numberToWesternWords(whole);

  const { major, minor } = CURRENCY_NAMES[currency] ?? {
    major: currency,
    minor: "Cents",
  };

  const fractionWords =
    fraction > 0
      ? ` and ${useIndianSystem ? numberToIndianWords(fraction) : numberToWesternWords(fraction)} ${minor}`
      : "";

  return `${major} ${words}${fractionWords} Only`;
}

const CURRENCY_NAMES: Record<string, { major: string; minor: string }> = {
  INR: { major: "Rupees", minor: "Paise" },
  USD: { major: "Dollars", minor: "Cents" },
  EUR: { major: "Euros", minor: "Cents" },
  GBP: { major: "Pounds", minor: "Pence" },
  AED: { major: "Dirhams", minor: "Fils" },
  AUD: { major: "Dollars", minor: "Cents" },
  CAD: { major: "Dollars", minor: "Cents" },
  SGD: { major: "Dollars", minor: "Cents" },
};

export const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "Pound Sterling" },
  { code: "AED", symbol: "AED ", label: "UAE Dirham" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar" },
];

/**
 * Formats money with the right digit grouping.
 *
 * Indian grouping is 1,20,000 rather than 120,000 — showing the wrong one on
 * a rupee invoice reads as an obvious mistake to any Indian recipient.
 */
export function formatMoney(value: number, symbol: string, currency: string): string {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const formatted = Math.abs(value).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : ""}${symbol}${formatted}`;
}

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

/** A GSTIN is 15 characters with a fixed shape; a typo invalidates the invoice. */
export function validateGstin(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  if (trimmed.length !== 15) return "A GSTIN is exactly 15 characters.";
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(trimmed)) {
    return "That doesn't look like a valid GSTIN.";
  }
  return null;
}

let counter = 0;
export const newLineId = () => `l${++counter}${Date.now().toString(36)}`;

export function emptyItem(taxRate = 18): LineItem {
  return {
    id: newLineId(),
    description: "",
    hsn: "",
    quantity: 1,
    unit: "",
    rate: 0,
    discount: 0,
    taxRate,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function sampleInvoice(kind: DocumentKind = "invoice"): InvoiceDoc {
  return {
    kind,
    number: `${kind === "invoice" ? "INV" : kind === "receipt" ? "RCPT" : "QTN"}-001`,
    date: today(),
    dueDate: "",
    placeOfSupply: "Karnataka",
    currency: "INR",
    currencySymbol: "₹",
    taxMode: "gst",
    flatTaxRate: 18,
    taxLabel: "GST",
    from: {
      name: "Your Business Name",
      address: "12 MG Road\nBengaluru 560001",
      email: "billing@example.com",
      phone: "+91 98765 43210",
      gstin: "",
      state: "Karnataka",
    },
    to: {
      name: "Client Name",
      address: "",
      email: "",
      phone: "",
      gstin: "",
      state: "Karnataka",
    },
    items: [
      {
        id: newLineId(),
        description: "Design and development work",
        hsn: "998314",
        quantity: 1,
        unit: "job",
        rate: 50_000,
        discount: 0,
        taxRate: 18,
      },
    ],
    notes: "",
    terms: "Payment due within 15 days.",
    bankDetails: "",
    upiId: "",
    logo: null,
    showAmountInWords: true,
    roundOff: true,
  };
}
