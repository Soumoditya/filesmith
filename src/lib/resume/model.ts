import type { FontFamily } from "../doc/fontCatalogue";
import type { PageSizeName, Rgb } from "../doc/model";

/**
 * What a resume actually contains, kept independent of how it's drawn.
 *
 * Templates read this and produce document blocks; the ATS checker reads the
 * same structure to work out whether a parser will cope. Keeping the data
 * separate is what lets someone switch template without retyping anything.
 */

export interface Link {
  label: string;
  url: string;
}

export interface Contact {
  name: string;
  /** The line under the name — "Senior Accountant", not a paragraph. */
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: Link[];
  /** Normal in India and much of Europe; leave empty for US applications. */
  photo?: { data: string; format: "png" | "jpg" };
}

export interface DateRange {
  start: string;
  end: string;
  current?: boolean;
}

export interface ExperienceItem extends DateRange {
  id: string;
  role: string;
  organisation: string;
  location: string;
  bullets: string[];
}

export interface EducationItem extends DateRange {
  id: string;
  qualification: string;
  institution: string;
  location: string;
  /** Percentage, CGPA or classification — whatever the reader expects. */
  grade: string;
  notes: string;
}

export interface ProjectItem extends DateRange {
  id: string;
  name: string;
  role: string;
  link: string;
  bullets: string[];
}

export interface SkillGroup {
  id: string;
  label: string;
  /** Stored as a list so templates can decide between commas and columns. */
  items: string[];
}

export type SectionKind =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "list"
  | "text";

interface BaseSection {
  id: string;
  /** The heading printed on the page. Editable — parsers expect standard words. */
  title: string;
  hidden?: boolean;
}

export interface SummarySection extends BaseSection {
  kind: "summary";
  body: string;
}

export interface ExperienceSection extends BaseSection {
  kind: "experience";
  items: ExperienceItem[];
}

export interface EducationSection extends BaseSection {
  kind: "education";
  items: EducationItem[];
}

export interface SkillsSection extends BaseSection {
  kind: "skills";
  groups: SkillGroup[];
}

export interface ProjectsSection extends BaseSection {
  kind: "projects";
  items: ProjectItem[];
}

/** Certifications, awards, languages, publications — anything itemised. */
export interface ListSection extends BaseSection {
  kind: "list";
  items: string[];
}

/** A free-text section for anything the fixed shapes don't cover. */
export interface TextSection extends BaseSection {
  kind: "text";
  body: string;
}

export type Section =
  | SummarySection
  | ExperienceSection
  | EducationSection
  | SkillsSection
  | ProjectsSection
  | ListSection
  | TextSection;

export type TemplateId =
  | "classic"
  | "modern"
  | "compact"
  | "academic"
  | "photo"
  | "twoColumn";

export interface ResumeOptions {
  template: TemplateId;
  family: FontFamily;
  baseSize: number;
  lineHeight: number;
  accent: Rgb;
  pageSize: PageSizeName;
  /** Page margin in points. */
  margin: number;
  /** How dates are written, e.g. "Mar 2024" vs "03/2024". */
  dateStyle: "short" | "numeric" | "long";
  showPhoto: boolean;
  /** Draw a hairline under each section heading. */
  headingRules: boolean;
}

export interface Resume {
  contact: Contact;
  sections: Section[];
  options: ResumeOptions;
}

export const DEFAULT_OPTIONS: ResumeOptions = {
  template: "classic",
  family: "sans",
  baseSize: 10,
  lineHeight: 1.32,
  accent: { r: 0.11, g: 0.1, b: 0.09 },
  pageSize: "a4",
  margin: 48,
  dateStyle: "short",
  showPhoto: false,
  headingRules: true,
};

let counter = 0;
export const newId = (prefix = "s") => `${prefix}${++counter}${Date.now().toString(36)}`;

/**
 * A worked example rather than an empty form. People understand what to
 * write far faster from a filled-in resume they can edit over.
 */
export function sampleResume(): Resume {
  return {
    contact: {
      name: "Asha Menon",
      headline: "Operations Analyst",
      email: "asha.menon@example.com",
      phone: "+91 98765 43210",
      location: "Bengaluru, India",
      links: [
        { label: "LinkedIn", url: "linkedin.com/in/ashamenon" },
        { label: "Portfolio", url: "ashamenon.example.com" },
      ],
    },
    sections: [
      {
        id: newId(),
        kind: "summary",
        title: "Summary",
        body: "Operations analyst with five years in logistics and supply chain. Cut fulfilment costs by 18% across a 40-site network and built the reporting that three regional teams now run on.",
      },
      {
        id: newId(),
        kind: "experience",
        title: "Experience",
        items: [
          {
            id: newId("e"),
            role: "Operations Analyst",
            organisation: "Meridian Logistics",
            location: "Bengaluru",
            start: "2022-03",
            end: "",
            current: true,
            bullets: [
              "Cut average fulfilment cost per order by 18% by rebuilding the route allocation model.",
              "Built the weekly reporting pack now used by three regional managers, replacing a manual process that took two days.",
              "Trained 12 warehouse leads on the new stock system, taking adoption from 40% to 95% in one quarter.",
            ],
          },
          {
            id: newId("e"),
            role: "Junior Analyst",
            organisation: "Kestrel Supply Co.",
            location: "Pune",
            start: "2020-07",
            end: "2022-02",
            bullets: [
              "Ran demand forecasts for 200 SKUs, reducing stockouts by a third.",
              "Automated the monthly variance report, saving roughly 15 hours a month.",
            ],
          },
        ],
      },
      {
        id: newId(),
        kind: "education",
        title: "Education",
        items: [
          {
            id: newId("d"),
            qualification: "B.Com, Statistics",
            institution: "University of Pune",
            location: "Pune",
            start: "2017",
            end: "2020",
            grade: "First class, 8.4 CGPA",
            notes: "",
          },
        ],
      },
      {
        id: newId(),
        kind: "skills",
        title: "Skills",
        groups: [
          {
            id: newId("g"),
            label: "Analysis",
            items: ["Excel", "SQL", "Power BI", "Python (pandas)"],
          },
          {
            id: newId("g"),
            label: "Operations",
            items: ["SAP", "Demand planning", "Vendor management"],
          },
        ],
      },
      {
        id: newId(),
        kind: "list",
        title: "Certifications",
        items: [
          "Lean Six Sigma Green Belt — 2023",
          "Google Data Analytics Certificate — 2021",
        ],
      },
    ],
    options: { ...DEFAULT_OPTIONS },
  };
}

/** An empty resume, for people who'd rather start from nothing. */
export function emptyResume(): Resume {
  return {
    contact: {
      name: "",
      headline: "",
      email: "",
      phone: "",
      location: "",
      links: [],
    },
    sections: [
      { id: newId(), kind: "summary", title: "Summary", body: "" },
      { id: newId(), kind: "experience", title: "Experience", items: [] },
      { id: newId(), kind: "education", title: "Education", items: [] },
      { id: newId(), kind: "skills", title: "Skills", groups: [] },
    ],
    options: { ...DEFAULT_OPTIONS },
  };
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Formats a stored `YYYY-MM` (or bare `YYYY`) for display.
 *
 * Anything unrecognised is passed through untouched — people write "Summer
 * 2021" or "Ongoing" and having the tool mangle that is worse than obeying it.
 */
export function formatDate(value: string, style: ResumeOptions["dateStyle"]): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const full = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (full) {
    const year = full[1];
    const month = Number(full[2]);
    if (month < 1 || month > 12) return trimmed;
    if (style === "numeric") return `${String(month).padStart(2, "0")}/${year}`;
    if (style === "long") return `${MONTHS_LONG[month - 1]} ${year}`;
    return `${MONTHS_SHORT[month - 1]} ${year}`;
  }

  return trimmed;
}

export function formatRange(range: DateRange, style: ResumeOptions["dateStyle"]): string {
  const start = formatDate(range.start, style);
  const end = range.current ? "Present" : formatDate(range.end, style);
  if (!start && !end) return "";
  if (!start) return end;
  if (!end) return start;
  return `${start} – ${end}`;
}

/** Sections the user can add, and what they're for. */
export const ADDABLE_SECTIONS: Array<{
  kind: SectionKind;
  title: string;
  hint: string;
}> = [
  { kind: "experience", title: "Experience", hint: "Jobs, internships, volunteering" },
  { kind: "education", title: "Education", hint: "Degrees, diplomas, schooling" },
  { kind: "skills", title: "Skills", hint: "Grouped by area" },
  { kind: "projects", title: "Projects", hint: "Things you built or ran" },
  { kind: "list", title: "Certifications", hint: "A simple bulleted list" },
  { kind: "list", title: "Awards", hint: "A simple bulleted list" },
  { kind: "list", title: "Languages", hint: "A simple bulleted list" },
  { kind: "list", title: "Publications", hint: "A simple bulleted list" },
  { kind: "text", title: "Custom section", hint: "A heading and free text" },
];

export function makeSection(kind: SectionKind, title: string): Section {
  const id = newId();
  switch (kind) {
    case "summary":
      return { id, kind, title, body: "" };
    case "experience":
      return { id, kind, title, items: [] };
    case "education":
      return { id, kind, title, items: [] };
    case "skills":
      return { id, kind, title, groups: [] };
    case "projects":
      return { id, kind, title, items: [] };
    case "list":
      return { id, kind, title, items: [] };
    case "text":
      return { id, kind, title, body: "" };
  }
}
