import { describe, expect, it } from "vitest";
import {
  buildQrPayload,
  EMPTY_QR_FORM,
  parseBulkLine,
  splitName,
  type QrForm,
} from "./qrPayload";

const form = (over: Partial<QrForm> = {}): QrForm => ({ ...EMPTY_QR_FORM, ...over });

describe("link", () => {
  it("adds https:// to a bare domain", () => {
    expect(buildQrPayload("link", form({ link: "example.com" }))).toBe(
      "https://example.com",
    );
  });

  it("leaves an existing scheme alone", () => {
    for (const url of ["http://a.com", "https://a.com", "mailto:a@b.com"]) {
      expect(buildQrPayload("link", form({ link: url }))).toBe(url);
    }
  });

  it("is empty when the field is blank", () => {
    expect(buildQrPayload("link", form({ link: "   " }))).toBe("");
  });
});

describe("wifi", () => {
  it("builds a standard WIFI payload", () => {
    expect(
      buildQrPayload("wifi", form({ wifiSsid: "HomeNet", wifiPassword: "hunter2" })),
    ).toBe("WIFI:T:WPA;S:HomeNet;P:hunter2;;");
  });

  it("escapes delimiters in the name and password", () => {
    // An SSID containing ';' would otherwise terminate the field early and
    // hand the phone a corrupt payload.
    expect(
      buildQrPayload(
        "wifi",
        form({ wifiSsid: "Cafe;Bar", wifiPassword: 'a:b,c"d\\e' }),
      ),
    ).toBe('WIFI:T:WPA;S:Cafe\\;Bar;P:a\\:b\\,c\\"d\\\\e;;');
  });

  it("omits the password for open networks", () => {
    expect(
      buildQrPayload(
        "wifi",
        form({ wifiSsid: "Free", wifiSecurity: "nopass", wifiPassword: "ignored" }),
      ),
    ).toBe("WIFI:T:nopass;S:Free;;");
  });

  it("marks hidden networks", () => {
    expect(
      buildQrPayload("wifi", form({ wifiSsid: "Ghost", wifiHidden: true })),
    ).toContain(";H:true;");
  });
});

describe("contact", () => {
  it("splits names into the vCard N field", () => {
    expect(splitName("Asha Menon")).toEqual({ last: "Menon", first: "Asha" });
    expect(splitName("Asha Rani Menon")).toEqual({
      last: "Menon",
      first: "Asha Rani",
    });
    expect(splitName("Prince")).toEqual({ last: "Prince", first: "" });
    expect(splitName("   ")).toEqual({ last: "", first: "" });
  });

  it("produces a well-formed vCard", () => {
    const out = buildQrPayload(
      "contact",
      form({ name: "Asha Menon", phone: "+919876543210", contactEmail: "a@b.com" }),
    );
    const lines = out.split("\n");
    expect(lines[0]).toBe("BEGIN:VCARD");
    expect(lines[1]).toBe("VERSION:3.0");
    expect(lines).toContain("N:Menon;Asha;;;");
    expect(lines).toContain("TEL;TYPE=CELL:+919876543210");
    expect(lines.at(-1)).toBe("END:VCARD");
  });

  it("skips optional fields that are empty", () => {
    const out = buildQrPayload("contact", form({ name: "Solo" }));
    expect(out).not.toContain("ORG:");
    expect(out).not.toContain("TEL");
    expect(out).not.toContain("URL:");
  });
});

describe("email and sms", () => {
  it("encodes subject and body as query parameters", () => {
    const out = buildQrPayload(
      "email",
      form({ emailTo: "a@b.com", emailSubject: "Hi there", emailBody: "A & B" }),
    );
    expect(out.startsWith("mailto:a@b.com?")).toBe(true);
    const query = new URLSearchParams(out.split("?")[1]);
    expect(query.get("subject")).toBe("Hi there");
    expect(query.get("body")).toBe("A & B");
  });

  it("omits the query string when there's nothing to add", () => {
    expect(buildQrPayload("email", form({ emailTo: "a@b.com" }))).toBe(
      "mailto:a@b.com",
    );
  });

  it("builds SMSTO with and without a message", () => {
    expect(buildQrPayload("sms", form({ smsTo: "+911", smsBody: "yo" }))).toBe(
      "SMSTO:+911:yo",
    );
    expect(buildQrPayload("sms", form({ smsTo: "+911" }))).toBe("SMSTO:+911");
  });
});

describe("parseBulkLine", () => {
  it("numbers unlabelled lines", () => {
    expect(parseBulkLine("https://a.com", 0)).toEqual({
      name: "qr-1",
      value: "https://a.com",
    });
  });

  it("uses a label before the first comma", () => {
    expect(parseBulkLine("team page, https://a.com/team", 3)).toEqual({
      name: "team page",
      value: "https://a.com/team",
    });
  });

  it("keeps commas that appear inside the value", () => {
    expect(parseBulkLine("x, a,b,c", 0)?.value).toBe("a,b,c");
  });

  it("strips characters that are illegal in filenames", () => {
    expect(parseBulkLine('a/b:c*d?e"f<g>h|i, v', 0)?.name).toBe("a-b-c-d-e-f-g-h-i");
  });

  it("skips blank lines and labels with no value", () => {
    expect(parseBulkLine("   ", 0)).toBeNull();
    expect(parseBulkLine("label,   ", 0)).toBeNull();
  });

  it("treats a leading comma as part of the value, not a label", () => {
    expect(parseBulkLine(",value", 0)).toEqual({ name: "qr-1", value: ",value" });
  });
});
