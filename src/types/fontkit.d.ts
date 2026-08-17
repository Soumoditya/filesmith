/**
 * fontkit ships no TypeScript declarations. Only the surface the document
 * engine touches is declared here — pdf-lib consumes the rest opaquely
 * through `registerFontkit`.
 */
declare module "fontkit" {
  export interface FontkitGlyph {
    id: number;
  }

  export interface FontkitFont {
    hasGlyphForCodePoint(codePoint: number): boolean;
    glyphForCodePoint(codePoint: number): FontkitGlyph;
    layout(text: string): { glyphs: FontkitGlyph[] };
  }

  export function create(buffer: Uint8Array): FontkitFont;

  const fontkit: { create: typeof create };
  export default fontkit;
}
