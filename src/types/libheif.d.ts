/**
 * libheif-js ships no TypeScript declarations. Only the decode path the image
 * pipeline uses is declared — enough to read an iPhone HEIC photo into a
 * canvas, which is the whole reason it's here.
 */
declare module "libheif-js/wasm-bundle" {
  export interface HeifImage {
    get_width(): number;
    get_height(): number;
    /** Fills `imageData` in place, then calls back with it, or null on failure. */
    display(imageData: ImageData, callback: (result: ImageData | null) => void): void;
  }

  export interface HeifDecoder {
    decode(data: Uint8Array): HeifImage[];
  }

  const libheif: {
    HeifDecoder: new () => HeifDecoder;
  };

  export default libheif;
}
