import { describe, expect, it } from "vitest";
import {
  convertCase,
  countText,
  decodeBase64,
  encodeBase64,
  looksLikeBase64,
} from "./textTools";

describe("countText", () => {
  it("counts words, characters and sentences", () => {
    const counts = countText("Hello there. How are you?");
    expect(counts.words).toBe(5);
    expect(counts.sentences).toBe(2);
    expect(counts.charactersNoSpaces).toBeLessThan(counts.characters);
  });

  it("counts paragraphs and lines separately", () => {
    const counts = countText("One\nTwo\n\nThree");
    expect(counts.lines).toBe(4);
    expect(counts.paragraphs).toBe(2);
  });

  it("says speaking takes longer than reading", () => {
    const counts = countText("word ".repeat(1000));
    expect(counts.speakingMinutes).toBeGreaterThan(counts.readingMinutes);
  });

  it("reports zero for an empty document rather than one minute", () => {
    const counts = countText("");
    expect(counts.words).toBe(0);
    expect(counts.readingMinutes).toBe(0);
  });

  it("leaves the very common words out of the frequency list", () => {
    const counts = countText("the cat and the dog and the bird cat cat");
    expect(counts.topWords[0]).toEqual({ word: "cat", count: 3 });
    expect(counts.topWords.some((w) => w.word === "the")).toBe(false);
  });

  it("counts words with accents and other scripts", () => {
    expect(countText("café naïve résumé").words).toBe(3);
    expect(countText("नमस्ते दुनिया").words).toBe(2);
  });
});

describe("convertCase", () => {
  it("does the simple ones", () => {
    expect(convertCase("Hello There", "upper")).toBe("HELLO THERE");
    expect(convertCase("Hello There", "lower")).toBe("hello there");
    expect(convertCase("Hello There", "toggle")).toBe("hELLO tHERE");
  });

  it("keeps minor words lowercase in a title, except the first", () => {
    expect(convertCase("the lord of the rings", "title")).toBe("The Lord of the Rings");
    expect(convertCase("a tale of two cities", "title")).toBe("A Tale of Two Cities");
  });

  it("applies title case per line", () => {
    expect(convertCase("first title\nsecond title", "title")).toBe(
      "First Title\nSecond Title",
    );
  });

  it("capitalises after each full stop in sentence case", () => {
    expect(convertCase("hello there. how are you? fine!", "sentence")).toBe(
      "Hello there. How are you? Fine!",
    );
  });

  it("converts between programming cases", () => {
    expect(convertCase("hello there world", "camel")).toBe("helloThereWorld");
    expect(convertCase("hello there world", "pascal")).toBe("HelloThereWorld");
    expect(convertCase("hello there world", "snake")).toBe("hello_there_world");
    expect(convertCase("hello there world", "kebab")).toBe("hello-there-world");
    expect(convertCase("hello there world", "constant")).toBe("HELLO_THERE_WORLD");
  });

  it("splits an existing casing style correctly", () => {
    // Round-tripping between styles must not glue words together.
    expect(convertCase("helloThereWorld", "snake")).toBe("hello_there_world");
    expect(convertCase("HelloThereWorld", "kebab")).toBe("hello-there-world");
    expect(convertCase("hello_there_world", "camel")).toBe("helloThereWorld");
    expect(convertCase("HELLO_THERE_WORLD", "camel")).toBe("helloThereWorld");
  });

  it("handles runs of capitals sensibly", () => {
    expect(convertCase("XMLHttpRequest", "snake")).toBe("xml_http_request");
  });

  it("leaves an empty string alone", () => {
    for (const style of ["upper", "title", "camel", "snake"] as const) {
      expect(convertCase("", style)).toBe("");
    }
  });
});

describe("base64", () => {
  it("round-trips plain text", () => {
    const text = "Hello there";
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });

  it("round-trips Unicode, which naive btoa cannot", () => {
    // btoa alone throws on anything above Latin-1.
    for (const text of ["नमस्ते", "₹1,20,000", "café — naïve", "日本語", "🎉 emoji"]) {
      expect(decodeBase64(encodeBase64(text))).toBe(text);
    }
  });

  it("produces the standard encoding", () => {
    expect(encodeBase64("Hello")).toBe("SGVsbG8=");
  });

  it("produces a URL-safe variant without padding", () => {
    const encoded = encodeBase64("~~~???", true);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(decodeBase64(encoded)).toBe("~~~???");
  });

  it("decodes URL-safe input and restores missing padding", () => {
    expect(decodeBase64("SGVsbG8")).toBe("Hello");
  });

  it("ignores whitespace in the input", () => {
    expect(decodeBase64("SGVs bG8=\n")).toBe("Hello");
  });

  it("recognises what looks like Base64", () => {
    expect(looksLikeBase64("SGVsbG8=")).toBe(true);
    expect(looksLikeBase64("hello there!")).toBe(false);
    expect(looksLikeBase64("ab")).toBe(false);
  });
});
