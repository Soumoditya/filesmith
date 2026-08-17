/**
 * Builds the strings that go inside a QR code.
 *
 * These formats are conventions that phone cameras recognise, not a single
 * standard, and every one of them has an escaping rule that's easy to get
 * subtly wrong — hence living here on its own, with tests.
 */

export type QrKind = "link" | "text" | "wifi" | "contact" | "email" | "sms";

export interface QrForm {
  link: string;
  text: string;
  wifiSsid: string;
  wifiPassword: string;
  wifiSecurity: "WPA" | "WEP" | "nopass";
  wifiHidden: boolean;
  name: string;
  phone: string;
  contactEmail: string;
  org: string;
  url: string;
  emailTo: string;
  emailSubject: string;
  emailBody: string;
  smsTo: string;
  smsBody: string;
}

export const EMPTY_QR_FORM: QrForm = {
  link: "",
  text: "",
  wifiSsid: "",
  wifiPassword: "",
  wifiSecurity: "WPA",
  wifiHidden: false,
  name: "",
  phone: "",
  contactEmail: "",
  org: "",
  url: "",
  emailTo: "",
  emailSubject: "",
  emailBody: "",
  smsTo: "",
  smsBody: "",
};

/** WiFi and vCard payloads treat these as delimiters, so they must be escaped. */
function esc(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

/** Splits a display name into the vCard `N:` field's Last;First shape. */
export function splitName(full: string): { last: string; first: string } {
  const bits = full.trim().split(/\s+/).filter(Boolean);
  if (bits.length === 0) return { last: "", first: "" };
  if (bits.length === 1) return { last: bits[0], first: "" };
  const last = bits[bits.length - 1];
  return { last, first: bits.slice(0, -1).join(" ") };
}

export function buildQrPayload(kind: QrKind, f: QrForm): string {
  switch (kind) {
    case "link": {
      const v = f.link.trim();
      if (!v) return "";
      // People type "example.com"; without a scheme that isn't a link.
      return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
    }

    case "text":
      return f.text;

    case "wifi": {
      if (!f.wifiSsid.trim()) return "";
      const parts = [`T:${f.wifiSecurity}`, `S:${esc(f.wifiSsid)}`];
      if (f.wifiSecurity !== "nopass" && f.wifiPassword) {
        parts.push(`P:${esc(f.wifiPassword)}`);
      }
      if (f.wifiHidden) parts.push("H:true");
      return `WIFI:${parts.join(";")};;`;
    }

    case "contact": {
      if (!f.name.trim()) return "";
      const { last, first } = splitName(f.name);
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${esc(f.name.trim())}`,
        `N:${esc(last)};${esc(first)};;;`,
      ];
      if (f.org) lines.push(`ORG:${esc(f.org)}`);
      if (f.phone) lines.push(`TEL;TYPE=CELL:${f.phone}`);
      if (f.contactEmail) lines.push(`EMAIL:${f.contactEmail}`);
      if (f.url) lines.push(`URL:${f.url}`);
      lines.push("END:VCARD");
      return lines.join("\n");
    }

    case "email": {
      if (!f.emailTo.trim()) return "";
      const params = new URLSearchParams();
      if (f.emailSubject) params.set("subject", f.emailSubject);
      if (f.emailBody) params.set("body", f.emailBody);
      const q = params.toString();
      return `mailto:${f.emailTo.trim()}${q ? `?${q}` : ""}`;
    }

    case "sms": {
      if (!f.smsTo.trim()) return "";
      return f.smsBody
        ? `SMSTO:${f.smsTo.trim()}:${f.smsBody}`
        : `SMSTO:${f.smsTo.trim()}`;
    }
  }
}

/**
 * Parses one line of the bulk input into a filename and a value.
 * "label, value" gives a named output; a bare line is numbered.
 */
export function parseBulkLine(
  line: string,
  index: number,
): { name: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const comma = trimmed.indexOf(",");
  const hasLabel = comma > 0;
  const rawName = hasLabel ? trimmed.slice(0, comma).trim() : `qr-${index + 1}`;
  const value = hasLabel ? trimmed.slice(comma + 1).trim() : trimmed;
  if (!value) return null;

  // Strip characters that are illegal in filenames on Windows and macOS.
  const name = rawName.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || `qr-${index + 1}`;
  return { name, value };
}
