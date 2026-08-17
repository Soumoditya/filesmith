import { describe, expect, it, vi } from "vitest";
import { findBestSetting, parseSize, SIZE_PRESETS } from "./sizeTarget";

/**
 * The encoder is faked with a monotonic curve so the search logic can be
 * checked exactly. Real encoders are lumpier, which is why this bisects
 * rather than interpolating.
 */
const linear = (atMin: number, atMax: number, min = 0.1, max = 1) =>
  vi.fn(async (setting: number) => {
    const t = (setting - min) / (max - min);
    return Math.round(atMin + t * (atMax - atMin));
  });

describe("findBestSetting", () => {
  it("keeps full quality when the file already fits", async () => {
    const encode = linear(100, 1000);
    const result = await findBestSetting(encode, 5000);
    expect(result.setting).toBe(1);
    expect(result.achieved).toBe(true);
    // One probe is enough to know; don't burn time re-encoding.
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it("finds a setting that fits when full quality doesn't", async () => {
    const result = await findBestSetting(linear(100, 1000), 500);
    expect(result.achieved).toBe(true);
    expect(result.bytes).toBeLessThanOrEqual(500);
    expect(result.setting).toBeGreaterThan(0.1);
    expect(result.setting).toBeLessThan(1);
  });

  it("gets close to the cap rather than overshooting downwards", async () => {
    const target = 500;
    const result = await findBestSetting(linear(100, 1000), target);
    // Landing far under the limit means needlessly degraded output.
    expect(result.bytes).toBeGreaterThan(target * 0.8);
  });

  it("reports failure when even the lowest setting is too big", async () => {
    const result = await findBestSetting(linear(2000, 9000), 500);
    expect(result.achieved).toBe(false);
    expect(result.setting).toBe(0.1);
    // Two probes: best and worst. No point bisecting a range that can't work.
    expect(result.attempts).toBe(2);
  });

  it("never spends more encodes than allowed", async () => {
    const encode = linear(100, 100_000);
    const result = await findBestSetting(encode, 4321, { maxAttempts: 5 });
    expect(encode.mock.calls.length).toBeLessThanOrEqual(5);
    expect(result.attempts).toBeLessThanOrEqual(5);
  });

  it("respects a custom range", async () => {
    const result = await findBestSetting(linear(100, 1000, 0.5, 0.9), 400, {
      min: 0.5,
      max: 0.9,
    });
    expect(result.setting).toBeGreaterThanOrEqual(0.5);
    expect(result.setting).toBeLessThanOrEqual(0.9);
  });

  it("copes with an encoder whose size barely moves", async () => {
    // Quality 80 and 81 often produce identical bytes; the search must still
    // terminate rather than bisecting forever.
    const result = await findBestSetting(async () => 900, 1000);
    expect(result.achieved).toBe(true);
    expect(result.bytes).toBe(900);
  });

  it("handles an exact match on the target", async () => {
    const result = await findBestSetting(linear(500, 500), 500);
    expect(result.achieved).toBe(true);
    expect(result.bytes).toBe(500);
  });
});

describe("parseSize", () => {
  it("reads the units people type", () => {
    expect(parseSize("2mb")).toBe(2 * 1024 * 1024);
    expect(parseSize("2 MB")).toBe(2 * 1024 * 1024);
    expect(parseSize("500kb")).toBe(500 * 1024);
    expect(parseSize("500 KB")).toBe(500 * 1024);
    expect(parseSize("1.5mb")).toBe(Math.round(1.5 * 1024 * 1024));
    expect(parseSize("1024b")).toBe(1024);
  });

  it("treats a bare number as megabytes, which is what forms mean", () => {
    expect(parseSize("2")).toBe(2 * 1024 * 1024);
  });

  it("ignores thousands separators", () => {
    expect(parseSize("1,024 kb")).toBe(1024 * 1024);
  });

  it("rejects nonsense instead of guessing", () => {
    for (const bad of ["", "  ", "abc", "-5mb", "0", "2 gigabytes", "mb"]) {
      expect(parseSize(bad), `expected ${JSON.stringify(bad)} to be rejected`).toBeNull();
    }
  });
});

describe("presets", () => {
  it("are ordered smallest first and all valid", () => {
    const sizes = SIZE_PRESETS.map((p) => p.bytes);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    for (const preset of SIZE_PRESETS) {
      expect(parseSize(preset.label)).toBe(preset.bytes);
    }
  });
});
