import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { setFontLoader } from "../doc/fonts";
import { renderDocument } from "../doc/render";
import { checkResume } from "./ats";
import {
  emptyResume,
  formatDate,
  formatRange,
  sampleResume,
  type Resume,
} from "./model";
import { buildResumeDocument, TEMPLATES } from "./templates";

const FONT_DIR = join(process.cwd(), "public", "fonts");

beforeAll(() => {
  setFontLoader(async (name) => new Uint8Array(await readFile(join(FONT_DIR, name))));
});

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
const getPdfjs = () => (pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs"));

async function extractText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const doc = await task.promise;

  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    page.cleanup();
  }

  await task.destroy();
  return out;
}

/**
 * pdf.js emits a separate item whenever the font changes, so "₹4,50,000"
 * arrives as two items. Collapsing whitespace lets assertions talk about the
 * text a reader sees rather than the run boundaries.
 */
const squashed = (s: string) => s.replace(/\s+/g, "");

describe("date formatting", () => {
  it("formats stored YYYY-MM in each style", () => {
    expect(formatDate("2024-03", "short")).toBe("Mar 2024");
    expect(formatDate("2024-03", "long")).toBe("March 2024");
    expect(formatDate("2024-03", "numeric")).toBe("03/2024");
  });

  it("passes through anything it doesn't recognise", () => {
    // People write "Summer 2021" or "Ongoing"; mangling that is worse than
    // leaving it alone.
    for (const raw of ["Summer 2021", "Ongoing", "2019", ""]) {
      expect(formatDate(raw, "short")).toBe(raw);
    }
  });

  it("rejects impossible months rather than indexing off the end", () => {
    expect(formatDate("2024-13", "short")).toBe("2024-13");
    expect(formatDate("2024-00", "short")).toBe("2024-00");
  });

  it("writes Present for a current role", () => {
    expect(formatRange({ start: "2022-03", end: "", current: true }, "short")).toBe(
      "Mar 2022 – Present",
    );
  });

  it("copes with a missing end or start", () => {
    expect(formatRange({ start: "2022", end: "" }, "short")).toBe("2022");
    expect(formatRange({ start: "", end: "2024" }, "short")).toBe("2024");
    expect(formatRange({ start: "", end: "" }, "short")).toBe("");
  });
});

describe("every template renders the same content", () => {
  const resume = sampleResume();

  for (const template of TEMPLATES) {
    it(`${template.name} keeps the key facts`, async () => {
      const spec = buildResumeDocument({
        ...resume,
        options: { ...resume.options, template: template.id },
      });
      const { bytes, pageCount } = await renderDocument(spec);
      const text = await extractText(bytes);

      // Switching template must never lose content.
      expect(text).toContain("Asha Menon");
      expect(text).toContain("Operations Analyst");
      expect(text).toContain("Meridian Logistics");
      expect(text).toContain("asha.menon@example.com");
      expect(text).toContain("University of Pune");
      expect(pageCount).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("resume rendering", () => {
  it("sets the document title from the name", async () => {
    const spec = buildResumeDocument(sampleResume());
    expect(spec.title).toBe("Asha Menon — Resume");
    expect(spec.author).toBe("Asha Menon");
  });

  it("renders an empty resume without crashing", async () => {
    const { bytes, pageCount } = await renderDocument(buildResumeDocument(emptyResume()));
    expect(pageCount).toBe(1);
    expect(Buffer.from(bytes).toString("latin1").slice(0, 5)).toBe("%PDF-");
  });

  it("omits sections that have no content", async () => {
    const resume = emptyResume();
    resume.contact.name = "Solo Person";
    const text = await extractText(
      (await renderDocument(buildResumeDocument(resume))).bytes,
    );
    // Empty Experience/Education/Skills headings must not be printed.
    expect(text).toContain("Solo Person");
    expect(text).not.toContain("EXPERIENCE");
    expect(text).not.toContain("SKILLS");
  });

  it("hides a section the user switched off", async () => {
    const resume = sampleResume();
    const education = resume.sections.find((s) => s.kind === "education")!;
    education.hidden = true;
    const text = await extractText(
      (await renderDocument(buildResumeDocument(resume))).bytes,
    );
    expect(text).not.toContain("University of Pune");
    expect(text).toContain("Meridian Logistics");
  });

  it("keeps Indian names and rupee figures intact", async () => {
    const resume = sampleResume();
    resume.contact.name = "Priya Raghunathan";
    const summary = resume.sections.find((s) => s.kind === "summary")!;
    if (summary.kind === "summary") {
      summary.body = "Managed a ₹4,50,000 monthly budget across 12 vendors.";
    }
    const text = await extractText(
      (await renderDocument(buildResumeDocument(resume))).bytes,
    );
    expect(text).toContain("Priya Raghunathan");
    expect(squashed(text)).toContain("₹4,50,000");
  });
});

describe("ATS checks", () => {
  const clean = (): Resume => sampleResume();

  it("passes a well-formed resume", () => {
    const findings = checkResume(clean(), 1);
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe("good");
  });

  it("flags the two-column template as risky", () => {
    const resume = clean();
    resume.options.template = "twoColumn";
    const findings = checkResume(resume, 1);
    const problem = findings.find((f) => f.level === "problem");
    expect(problem?.title).toContain("confuse automated screening");
    // The explanation must say what actually happens, not just "don't".
    expect(problem?.detail).toMatch(/column/i);
  });

  it("flags missing contact details", () => {
    const resume = clean();
    resume.contact.email = "";
    resume.contact.phone = "";
    const findings = checkResume(resume);
    expect(findings.some((f) => f.title.includes("Contact details"))).toBe(true);
  });

  it("catches a malformed email", () => {
    const resume = clean();
    resume.contact.email = "asha.menon.example.com";
    expect(checkResume(resume).some((f) => f.title.includes("email"))).toBe(true);
  });

  it("notices a non-standard heading", () => {
    const resume = clean();
    const experience = resume.sections.find((s) => s.kind === "experience")!;
    experience.title = "My Journey So Far";
    const findings = checkResume(resume);
    expect(findings.some((f) => f.detail.includes("My Journey So Far"))).toBe(true);
  });

  it("notices duty-style bullets", () => {
    const resume = clean();
    const experience = resume.sections.find((s) => s.kind === "experience");
    if (experience?.kind === "experience") {
      experience.items[0].bullets = ["Responsible for the reporting pack."];
    }
    expect(checkResume(resume).some((f) => f.title.includes("duties"))).toBe(true);
  });

  it("notices when no achievement has a number in it", () => {
    const resume = clean();
    const experience = resume.sections.find((s) => s.kind === "experience");
    if (experience?.kind === "experience") {
      for (const item of experience.items) {
        item.bullets = ["Improved things", "Made processes better", "Helped the team"];
      }
    }
    expect(checkResume(resume).some((f) => f.title.includes("No numbers"))).toBe(true);
  });

  it("flags a role with no bullets", () => {
    const resume = clean();
    const experience = resume.sections.find((s) => s.kind === "experience");
    if (experience?.kind === "experience") experience.items[1].bullets = [];
    const findings = checkResume(resume);
    expect(findings.some((f) => f.title.includes("nothing under it"))).toBe(true);
  });

  it("warns about length, but not for an academic CV", () => {
    const resume = clean();
    expect(checkResume(resume, 4).some((f) => f.title.includes("4 pages"))).toBe(true);

    resume.options.template = "academic";
    expect(checkResume(resume, 4).some((f) => f.title.includes("4 pages"))).toBe(false);
  });

  it("explains the photo convention rather than forbidding it", () => {
    const resume = clean();
    resume.options.showPhoto = true;
    resume.contact.photo = { data: "", format: "png" };
    const finding = checkResume(resume).find((f) => f.title.includes("photo"));
    expect(finding?.detail).toMatch(/India/);
    expect(finding?.level).toBe("warning");
  });

  it("tells a beginner what's missing from an empty resume", () => {
    const findings = checkResume(emptyResume());
    expect(findings.some((f) => f.level === "problem")).toBe(true);
    expect(findings.every((f) => f.detail.length > 20)).toBe(true);
  });
});
