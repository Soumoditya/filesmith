import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { resumeToDocx } from "./docx";
import { emptyResume, sampleResume } from "./model";

/**
 * A .docx is a zip of XML. These unzip the output and read the document part,
 * which is the only way to know the file is genuinely valid rather than
 * merely non-empty — and Word export exists precisely because applicant
 * tracking systems parse it, so "it opens" is the whole requirement.
 */

async function documentXml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const entry = zip.file("word/document.xml");
  expect(entry, "word/document.xml must exist in the package").toBeTruthy();
  return entry!.async("string");
}

/** Text content with the XML tags stripped, as a parser would read it. */
function readableText(xml: string): string {
  return xml
    .replace(/<w:p[ >]/g, "\n<w:p ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

describe("Word export", () => {
  it("produces a real Office package", async () => {
    const blob = await resumeToDocx(sampleResume());
    expect(blob.size).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    // The parts every .docx must carry.
    expect(zip.file("[Content_Types].xml")).toBeTruthy();
    expect(zip.file("word/document.xml")).toBeTruthy();
    expect(zip.file("_rels/.rels")).toBeTruthy();
  });

  it("carries every piece of content across", async () => {
    const text = readableText(await documentXml(await resumeToDocx(sampleResume())));

    for (const expected of [
      "Asha Menon",
      "Operations Analyst",
      "asha.menon@example.com",
      "Meridian Logistics",
      "Kestrel Supply Co.",
      "University of Pune",
      "Lean Six Sigma Green Belt",
      "Power BI",
    ]) {
      expect(text, `expected "${expected}" in the Word output`).toContain(expected);
    }
  });

  it("keeps the rupee sign and accented characters", async () => {
    const resume = sampleResume();
    const summary = resume.sections.find((s) => s.kind === "summary")!;
    if (summary.kind === "summary") {
      summary.body = "Handled a ₹4,50,000 budget — café suppliers included.";
    }
    const text = readableText(await documentXml(await resumeToDocx(resume)));
    expect(text).toContain("₹4,50,000");
    expect(text).toContain("café");
    expect(text).toContain("—");
  });

  it("uses standard headings a parser will recognise", async () => {
    const text = readableText(await documentXml(await resumeToDocx(sampleResume())));
    for (const heading of ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"]) {
      expect(text).toContain(heading);
    }
  });

  it("stays single column, with no tables to scramble the reading order", async () => {
    // Tables are the single biggest cause of ATS misreads, so the Word export
    // deliberately contains none, whatever the chosen PDF template.
    const resume = sampleResume();
    resume.options.template = "twoColumn";
    const xml = await documentXml(await resumeToDocx(resume));
    expect(xml).not.toContain("<w:tbl>");
  });

  it("omits hidden sections", async () => {
    const resume = sampleResume();
    const education = resume.sections.find((s) => s.kind === "education")!;
    education.hidden = true;
    const text = readableText(await documentXml(await resumeToDocx(resume)));
    expect(text).not.toContain("University of Pune");
    expect(text).toContain("Meridian Logistics");
  });

  it("handles an empty resume without producing a broken file", async () => {
    const blob = await resumeToDocx(emptyResume());
    const xml = await documentXml(blob);
    expect(xml).toContain("<w:body>");
  });
});
