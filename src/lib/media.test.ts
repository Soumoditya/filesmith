import { describe, expect, it } from "vitest";
import {
  formatBitrate,
  formatTimecode,
  parseTimecode,
  suggestedBitrate,
  unsupportedFormat,
} from "./media";

/**
 * The pure parts of the media layer. Timecode parsing in particular is worth
 * pinning down: people type "1:23", "83" and "0:01:23" interchangeably, and a
 * trim that silently starts at the wrong second wastes a long encode.
 */

describe("formatTimecode", () => {
  it("drops the hours field until it's needed", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(9)).toBe("0:09");
    expect(formatTimecode(83)).toBe("1:23");
    expect(formatTimecode(599)).toBe("9:59");
  });

  it("shows hours past an hour", () => {
    expect(formatTimecode(3600)).toBe("1:00:00");
    expect(formatTimecode(3723)).toBe("1:02:03");
  });

  it("copes with rubbish rather than printing NaN", () => {
    expect(formatTimecode(NaN)).toBe("0:00");
    expect(formatTimecode(-5)).toBe("0:00");
    expect(formatTimecode(Infinity)).toBe("0:00");
  });
});

describe("parseTimecode", () => {
  it("reads the forms people actually type", () => {
    expect(parseTimecode("83")).toBe(83);
    expect(parseTimecode("1:23")).toBe(83);
    expect(parseTimecode("0:01:23")).toBe(83);
    expect(parseTimecode("1:02:03")).toBe(3723);
  });

  it("accepts fractions of a second", () => {
    expect(parseTimecode("1:23.5")).toBeCloseTo(83.5, 5);
    expect(parseTimecode("2.25")).toBeCloseTo(2.25, 5);
  });

  it("ignores surrounding spaces", () => {
    expect(parseTimecode("  1:23  ")).toBe(83);
  });

  it("round-trips against the formatter", () => {
    for (const seconds of [0, 9, 83, 599, 3600, 3723]) {
      expect(parseTimecode(formatTimecode(seconds))).toBe(seconds);
    }
  });

  it("rejects nonsense instead of guessing", () => {
    for (const bad of ["", "  ", "abc", "1:2:3:4", "-5", "1:-2", "1::2"]) {
      expect(parseTimecode(bad), `expected ${JSON.stringify(bad)} to be rejected`).toBeNull();
    }
  });
});

describe("unsupportedFormat", () => {
  const file = (name: string) => ({ name }) as File;

  it("names the formats WebCodecs can't open", () => {
    expect(unsupportedFormat(file("holiday.avi"))).toBe("AVI");
    expect(unsupportedFormat(file("clip.WMV"))).toBe("WMV");
    expect(unsupportedFormat(file("old.flv"))).toBe("FLV");
  });

  it("passes the formats that do work", () => {
    for (const name of ["a.mp4", "a.webm", "a.mkv", "a.mov", "a.mp3", "a.wav"]) {
      expect(unsupportedFormat(file(name))).toBeNull();
    }
  });
});

describe("formatBitrate", () => {
  it("switches to Mbps above a million", () => {
    expect(formatBitrate(8_000_000)).toBe("8.0 Mbps");
    expect(formatBitrate(2_400_000)).toBe("2.4 Mbps");
    expect(formatBitrate(320_000)).toBe("320 kbps");
  });

  it("says so when it doesn't know", () => {
    expect(formatBitrate(null)).toBe("unknown");
    expect(formatBitrate(NaN)).toBe("unknown");
  });
});

describe("suggestedBitrate", () => {
  it("rises with resolution", () => {
    const heights = [360, 480, 720, 1080, 1440, 2160];
    const rates = heights.map(suggestedBitrate);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
  });

  it("suggests something plausible for 1080p", () => {
    // Streaming services sit around 5-8 Mbps for 1080p.
    const rate = suggestedBitrate(1080);
    expect(rate).toBeGreaterThanOrEqual(4_000_000);
    expect(rate).toBeLessThanOrEqual(12_000_000);
  });
});
