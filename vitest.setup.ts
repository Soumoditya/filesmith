import * as skia from "@napi-rs/canvas";

/**
 * pdf.js expects the browser's drawing globals to exist the moment it is
 * imported, so these have to be installed before any test module loads —
 * a `beforeAll` hook runs too late.
 *
 * Backed by Skia via @napi-rs/canvas, which ships prebuilt binaries, so this
 * needs no compiler on the machine running the tests.
 */
const globals = globalThis as unknown as Record<string, unknown>;

globals.DOMMatrix ??= skia.DOMMatrix;
globals.Path2D ??= skia.Path2D;
globals.ImageData ??= skia.ImageData;
globals.Image ??= skia.Image;
