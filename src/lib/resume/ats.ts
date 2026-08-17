import type { Resume, Section } from "./model";
import { templateInfo } from "./templates";

/**
 * Checks a resume against what applicant tracking systems actually cope with.
 *
 * The point is not to nag. Each finding says what the parser does and why it
 * matters, because "avoid tables" on its own teaches nobody anything — and a
 * resume that looks lovely but gets silently rejected is the worst outcome
 * this tool could produce.
 */

export type CheckLevel = "problem" | "warning" | "good";

export interface AtsFinding {
  level: CheckLevel;
  title: string;
  detail: string;
}

/** Headings parsers recognise. Anything else risks a whole section being ignored. */
const STANDARD_HEADINGS = [
  "summary", "profile", "objective", "about",
  "experience", "work experience", "employment", "professional experience", "work history",
  "education", "academic background", "qualifications",
  "skills", "technical skills", "core skills", "competencies",
  "projects", "certifications", "licenses", "awards", "honours", "honors",
  "publications", "languages", "volunteering", "interests", "references",
];

const CONTACT_REQUIRED: Array<[keyof Resume["contact"], string]> = [
  ["name", "your name"],
  ["email", "an email address"],
  ["phone", "a phone number"],
];

function hasContent(section: Section): boolean {
  switch (section.kind) {
    case "summary":
    case "text":
      return section.body.trim().length > 0;
    case "experience":
    case "education":
    case "projects":
    case "list":
      return section.items.length > 0;
    case "skills":
      return section.groups.some((g) => g.items.length > 0);
  }
}

function countWords(resume: Resume): number {
  const parts: string[] = [resume.contact.headline];

  for (const section of resume.sections) {
    if (section.hidden) continue;
    switch (section.kind) {
      case "summary":
      case "text":
        parts.push(section.body);
        break;
      case "experience":
      case "projects":
        for (const item of section.items) parts.push(...item.bullets);
        break;
      case "list":
        parts.push(...section.items);
        break;
      case "education":
        for (const item of section.items) parts.push(item.notes);
        break;
      case "skills":
        for (const group of section.groups) parts.push(...group.items);
        break;
    }
  }

  return parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
}

/** Bullets that describe duties rather than results. */
const WEAK_OPENERS = [
  "responsible for",
  "duties included",
  "worked on",
  "helped with",
  "tasked with",
  "involved in",
];

export function checkResume(resume: Resume, pageCount?: number): AtsFinding[] {
  const findings: AtsFinding[] = [];
  const visible = resume.sections.filter((s) => !s.hidden && hasContent(s));

  // --- Template ------------------------------------------------------------
  const template = templateInfo(resume.options.template);
  if (!template.atsSafe) {
    findings.push({
      level: "problem",
      title: "This layout can confuse automated screening",
      detail: template.warning ?? "",
    });
  }

  // --- Contact details -----------------------------------------------------
  const missing = CONTACT_REQUIRED.filter(([field]) =>
    !String(resume.contact[field] ?? "").trim(),
  ).map(([, label]) => label);

  if (missing.length > 0) {
    findings.push({
      level: "problem",
      title: "Contact details are incomplete",
      detail: `A recruiter who wants to reach you needs ${missing.join(", ")}. Systems that can't find an email often discard the application outright.`,
    });
  }

  const email = resume.contact.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    findings.push({
      level: "problem",
      title: "That email address doesn't look right",
      detail: `“${email}” is missing something. Worth checking — it's the one field that has to work.`,
    });
  }

  // --- Sections ------------------------------------------------------------
  const kinds = new Set(visible.map((s) => s.kind));

  if (!kinds.has("experience") && !kinds.has("projects")) {
    findings.push({
      level: "problem",
      title: "Nothing showing what you've done",
      detail:
        "Add an Experience section, or Projects if you're early in your career. This is the part that gets read first.",
    });
  }

  if (!kinds.has("education")) {
    findings.push({
      level: "warning",
      title: "No education section",
      detail:
        "Many screening systems filter on qualifications. If you'd rather not lead with it, keep it short and put it at the bottom — but it's usually worth including.",
    });
  }

  if (!kinds.has("skills")) {
    findings.push({
      level: "warning",
      title: "No skills section",
      detail:
        "This is where keyword matching does most of its work. Listing the tools and methods named in the job advert measurably improves your odds.",
    });
  }

  const oddHeadings = visible.filter(
    (s) => !STANDARD_HEADINGS.includes(s.title.trim().toLowerCase()),
  );
  if (oddHeadings.length > 0) {
    findings.push({
      level: "warning",
      title: "Unusual section heading",
      detail: `${oddHeadings
        .map((s) => `“${s.title}”`)
        .join(", ")} isn't a heading parsers recognise, so that section may be skipped entirely. Standard words like Experience, Education and Skills are dull but reliable.`,
    });
  }

  // --- Content quality -----------------------------------------------------
  const summary = visible.find((s) => s.kind === "summary");
  if (!summary) {
    findings.push({
      level: "warning",
      title: "No summary at the top",
      detail:
        "Two or three lines saying who you are and what you've achieved. It's the first thing a person reads, and often the only thing they read carefully.",
    });
  }

  const experience = resume.sections.find((s) => s.kind === "experience");
  if (experience && experience.kind === "experience") {
    const noBullets = experience.items.filter(
      (i) => i.bullets.filter((b) => b.trim()).length === 0,
    );
    if (noBullets.length > 0) {
      findings.push({
        level: "warning",
        title: "A role with nothing under it",
        detail: `${noBullets
          .map((i) => `“${i.role || "an untitled role"}”`)
          .join(", ")} has no bullet points. A job title alone tells a reader very little.`,
      });
    }

    const allBullets = experience.items.flatMap((i) => i.bullets);
    const weak = allBullets.filter((b) =>
      WEAK_OPENERS.some((opener) => b.trim().toLowerCase().startsWith(opener)),
    );
    if (weak.length > 0) {
      findings.push({
        level: "warning",
        title: "Some bullets describe duties, not results",
        detail: `${weak.length} ${weak.length === 1 ? "bullet starts" : "bullets start"} with phrases like “responsible for”. Leading with the outcome reads far better: “Cut fulfilment cost 18%” rather than “Responsible for cost reduction”.`,
      });
    }

    const withNumbers = allBullets.filter((b) => /\d/.test(b)).length;
    if (allBullets.length >= 3 && withNumbers === 0) {
      findings.push({
        level: "warning",
        title: "No numbers anywhere",
        detail:
          "Figures make achievements concrete and are what people remember. How many, how much, how fast, how big a team?",
      });
    }
  }

  // --- Length --------------------------------------------------------------
  const words = countWords(resume);
  if (words > 0 && words < 100) {
    findings.push({
      level: "warning",
      title: "This is very short",
      detail: `About ${words} words. Unless you're just starting out, there's usually more worth saying.`,
    });
  }

  if (pageCount !== undefined && pageCount > 2 && resume.options.template !== "academic") {
    findings.push({
      level: "warning",
      title: `${pageCount} pages is long for a resume`,
      detail:
        "Most recruiters expect one page early in a career and two later on. Academic CVs are the exception — switch to the Academic template if that's what this is.",
    });
  }

  // --- Photo ---------------------------------------------------------------
  if (resume.options.showPhoto && resume.contact.photo) {
    findings.push({
      level: "warning",
      title: "You've included a photo",
      detail:
        "Normal in India, Germany and much of Europe. In the US, UK, Canada and Australia it's usually left off, and some employers discard resumes with photos to avoid bias claims. Worth matching the country you're applying to.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      level: "good",
      title: "Nothing to flag",
      detail:
        "Single column, standard headings, contact details present and achievements with numbers in them. This should parse cleanly and read well.",
    });
  }

  return findings;
}

export function countFindings(findings: AtsFinding[]) {
  return {
    problems: findings.filter((f) => f.level === "problem").length,
    warnings: findings.filter((f) => f.level === "warning").length,
  };
}
