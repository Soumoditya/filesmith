import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { buildQrPayload, EMPTY_QR_FORM, type QrForm } from "./qrPayload";

/**
 * Generating a QR code that *looks* right but doesn't scan is the classic
 * failure here, so these tests render each payload to real pixels and decode
 * them back with an independent reader.
 */

const SCALE = 4;
const QUIET_ZONE = 4;

function renderToRgba(text: string) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { data: modules, size } = qr.modules;

  const dim = (size + QUIET_ZONE * 2) * SCALE;
  const rgba = new Uint8ClampedArray(dim * dim * 4).fill(255);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y * size + x]) continue;
      const px = (x + QUIET_ZONE) * SCALE;
      const py = (y + QUIET_ZONE) * SCALE;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const i = ((py + dy) * dim + (px + dx)) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
      }
    }
  }

  return { rgba, dim };
}

function roundTrip(text: string): string | null {
  const { rgba, dim } = renderToRgba(text);
  return jsQR(rgba, dim, dim)?.data ?? null;
}

const form = (over: Partial<QrForm> = {}): QrForm => ({ ...EMPTY_QR_FORM, ...over });

describe("QR codes scan back to the original payload", () => {
  it("a link", () => {
    const payload = buildQrPayload("link", form({ link: "filesmith.app/hello" }));
    expect(payload).toBe("https://filesmith.app/hello");
    expect(roundTrip(payload)).toBe(payload);
  });

  it("WiFi credentials, including escaped delimiters", () => {
    const payload = buildQrPayload(
      "wifi",
      form({ wifiSsid: "Cafe;Bar", wifiPassword: "p@ss:word" }),
    );
    expect(roundTrip(payload)).toBe(payload);
  });

  it("a multi-line vCard", () => {
    const payload = buildQrPayload(
      "contact",
      form({
        name: "Asha Menon",
        phone: "+919876543210",
        contactEmail: "asha@example.com",
        org: "Example Ltd",
      }),
    );
    expect(roundTrip(payload)).toBe(payload);
  });

  it("non-ASCII text", () => {
    const payload = buildQrPayload("text", form({ text: "नमस्ते — café 日本語" }));
    expect(roundTrip(payload)).toBe(payload);
  });

  it("a long payload near the capacity limit", () => {
    const payload = buildQrPayload("text", form({ text: "A".repeat(1200) }));
    expect(roundTrip(payload)).toBe(payload);
  });
});
