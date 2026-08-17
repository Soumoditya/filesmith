/**
 * gifenc ships no TypeScript declarations. Only the encode path the
 * video-to-GIF tool uses is declared here.
 */
declare module "gifenc" {
  export interface GifFrameOptions {
    palette?: number[][];
    /** Milliseconds this frame is shown for. */
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
  }

  export interface GifEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: GifFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: { auto?: boolean }): GifEncoderInstance;

  /** Reduces RGBA pixels to a palette of at most `maxColors` entries. */
  export function quantize(
    data: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: "rgb565" | "rgb444" | "rgba4444"; oneBitAlpha?: boolean },
  ): number[][];

  /** Maps RGBA pixels onto palette indices. */
  export function applyPalette(
    data: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: "rgb565" | "rgb444" | "rgba4444",
  ): Uint8Array;
}
