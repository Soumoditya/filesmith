import { describe, expect, it } from "vitest";
import {
  baseNameOf,
  extensionOf,
  formatBytes,
  formatDuration,
  kindOf,
  withExtension,
} from "./files";

/** Minimal stand-in — kindOf only reads `name` and `type`. */
const file = (name: string, type = ""): File => ({ name, type }) as File;

describe("extensionOf / baseNameOf", () => {
  it("splits ordinary names", () => {
    expect(extensionOf("report.pdf")).toBe("pdf");
    expect(baseNameOf("report.pdf")).toBe("report");
  });

  it("uses the last dot", () => {
    expect(extensionOf("my.holiday.photo.JPG")).toBe("jpg");
    expect(baseNameOf("my.holiday.photo.JPG")).toBe("my.holiday.photo");
  });

  it("treats a dotfile as having no extension", () => {
    expect(extensionOf(".gitignore")).toBe("");
    expect(baseNameOf(".gitignore")).toBe(".gitignore");
  });

  it("handles names with no dot", () => {
    expect(extensionOf("README")).toBe("");
    expect(baseNameOf("README")).toBe("README");
  });
});

describe("kindOf", () => {
  it("classifies by extension", () => {
    expect(kindOf(file("a.pdf"))).toBe("pdf");
    expect(kindOf(file("a.HEIC"))).toBe("image");
    expect(kindOf(file("a.mkv"))).toBe("video");
    expect(kindOf(file("a.flac"))).toBe("audio");
    expect(kindOf(file("a.docx"))).toBe("document");
    expect(kindOf(file("a.csv"))).toBe("spreadsheet");
    expect(kindOf(file("a.zip"))).toBe("archive");
    expect(kindOf(file("a.md"))).toBe("text");
  });

  it("prefers the extension over a wrong MIME type", () => {
    // Browsers routinely report HEIC as image/* or nothing at all, and some
    // report .mkv as video/webm. The extension is the more reliable signal.
    expect(kindOf(file("clip.mkv", "video/webm"))).toBe("video");
  });

  it("falls back to MIME when the extension is unknown", () => {
    expect(kindOf(file("scan.unknownext", "image/png"))).toBe("image");
    expect(kindOf(file("blob", "application/pdf"))).toBe("pdf");
  });

  it("returns null when it genuinely cannot tell", () => {
    expect(kindOf(file("mystery", "application/octet-stream"))).toBeNull();
  });
});

describe("formatBytes", () => {
  it("shows whole numbers for bytes and kilobytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB");
  });

  it("shows a decimal from megabytes up", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
  });

  it("clamps to the largest unit it knows", () => {
    expect(formatBytes(1024 ** 6)).toContain("TB");
  });
});

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(75)).toBe("1:15");
  });

  it("adds an hours field only when needed", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("handles rubbish input", () => {
    expect(formatDuration(NaN)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(Infinity)).toBe("—");
  });
});

describe("withExtension", () => {
  it("swaps the extension", () => {
    expect(withExtension("photo.png", "webp")).toBe("photo.webp");
    expect(withExtension("photo.png", ".webp")).toBe("photo.webp");
  });

  it("adds one when there wasn't any", () => {
    expect(withExtension("photo", "webp")).toBe("photo.webp");
  });
});
