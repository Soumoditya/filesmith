import { DEFAULT_STYLE, pageSetup, type Block, type DocumentSpec, type Inline, type Rgb } from "../doc/model";
import {
  formatRange,
  type EducationItem,
  type ExperienceItem,
  type ProjectItem,
  type Resume,
  type ResumeOptions,
  type Section,
  type TemplateId,
} from "./model";

/**
 * Templates turn resume data into document blocks. Swapping template must
 * never lose content, so every one of them consumes the same model and
 * differs only in arrangement and emphasis.
 */

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  /** False means a parser may scramble it — surfaced prominently in the UI. */
  atsSafe: boolean;
  /** Shown when atsSafe is false. */
  warning?: string;
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: "classic",
    name: "Classic",
    description:
      "Centred name, ruled section headings, one column. The safest thing you can send anywhere.",
    atsSafe: true,
  },
  {
    id: "modern",
    name: "Modern",
    description:
      "Left-aligned with coloured headings. Still a single column, so it parses cleanly.",
    atsSafe: true,
  },
  {
    id: "compact",
    name: "Compact",
    description:
      "Tighter spacing to fit more on one page, without shrinking the text to nothing.",
    atsSafe: true,
  },
  {
    id: "academic",
    name: "Academic CV",
    description:
      "Room for long lists of publications, teaching and grants. Runs to several pages happily.",
    atsSafe: true,
  },
  {
    id: "photo",
    name: "With photo",
    description:
      "A photo beside your details. Normal in India and much of Europe; leave it off for US applications.",
    atsSafe: true,
  },
  {
    id: "twoColumn",
    name: "Two column",
    description:
      "Skills and contact details in a sidebar. The best-looking option, and the riskiest.",
    atsSafe: false,
    warning:
      "Applicant tracking systems read a page in one pass and frequently jumble side-by-side columns, mixing your sidebar into your job history. Use this when a person will read it — an email, a portfolio, a printed copy — and send a single-column version to job boards.",
  },
];

export function templateInfo(id: TemplateId): TemplateInfo {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

const GREY: Rgb = { r: 0.42, g: 0.4, b: 0.38 };

const text = (t: string, extra: Partial<Inline> = {}): Inline => ({ text: t, ...extra });

/** Joins non-empty parts with a separator, as inline runs. */
function joined(parts: string[], separator = "  ·  ", style: Partial<Inline> = {}): Inline[] {
  const kept = parts.filter((p) => p.trim());
  return kept.length === 0 ? [] : [text(kept.join(separator), style)];
}

interface Ctx {
  options: ResumeOptions;
  /** Section heading level, tuned per template. */
  headingLevel: 1 | 2 | 3;
  compact: boolean;
}

function sectionHeading(title: string, ctx: Ctx): Block {
  return {
    type: "heading",
    level: ctx.headingLevel,
    runs: [text(title.toUpperCase(), { colour: ctx.options.accent })],
    underline: ctx.options.headingRules,
    before: ctx.compact ? 8 : 12,
    after: ctx.compact ? 3 : 5,
  };
}

function experienceBlocks(item: ExperienceItem, ctx: Ctx): Block[] {
  const dates = formatRange(item, ctx.options.dateStyle);
  const blocks: Block[] = [
    {
      type: "paragraph",
      runs: [
        text(item.role, { bold: true }),
        ...(item.organisation ? [text(` — ${item.organisation}`)] : []),
      ],
      after: 1,
    },
  ];

  const meta = joined([item.location, dates], "  ·  ", { colour: GREY, size: ctx.options.baseSize - 0.5 });
  if (meta.length > 0) blocks.push({ type: "paragraph", runs: meta, after: ctx.compact ? 2 : 3 });

  const bullets = item.bullets.filter((b) => b.trim());
  if (bullets.length > 0) {
    blocks.push({
      type: "bullets",
      items: bullets.map((b) => [text(b)]),
      gap: ctx.compact ? 1 : 2,
      after: ctx.compact ? 5 : 8,
    });
  } else {
    blocks.push({ type: "spacer", height: ctx.compact ? 5 : 8 });
  }

  // The role, its dates and its first bullets belong together — a title
  // stranded at the foot of a page is the classic resume layout failure.
  return [{ type: "keepTogether", blocks }];
}

function educationBlocks(item: EducationItem, ctx: Ctx): Block[] {
  const dates = formatRange(item, ctx.options.dateStyle);
  const blocks: Block[] = [
    {
      type: "paragraph",
      runs: [
        text(item.qualification, { bold: true }),
        ...(item.institution ? [text(` — ${item.institution}`)] : []),
      ],
      after: 1,
    },
  ];

  const meta = joined([item.location, dates, item.grade], "  ·  ", {
    colour: GREY,
    size: ctx.options.baseSize - 0.5,
  });
  if (meta.length > 0) blocks.push({ type: "paragraph", runs: meta, after: 2 });

  if (item.notes.trim()) {
    blocks.push({ type: "paragraph", runs: [text(item.notes)], after: 2 });
  }

  blocks.push({ type: "spacer", height: ctx.compact ? 4 : 7 });
  return [{ type: "keepTogether", blocks }];
}

function projectBlocks(item: ProjectItem, ctx: Ctx): Block[] {
  const blocks: Block[] = [
    {
      type: "paragraph",
      runs: [
        text(item.name, { bold: true }),
        ...(item.role ? [text(` — ${item.role}`)] : []),
      ],
      after: 1,
    },
  ];

  const meta = joined([item.link, formatRange(item, ctx.options.dateStyle)], "  ·  ", {
    colour: GREY,
    size: ctx.options.baseSize - 0.5,
  });
  if (meta.length > 0) blocks.push({ type: "paragraph", runs: meta, after: 3 });

  const bullets = item.bullets.filter((b) => b.trim());
  if (bullets.length > 0) {
    blocks.push({
      type: "bullets",
      items: bullets.map((b) => [text(b)]),
      gap: ctx.compact ? 1 : 2,
      after: ctx.compact ? 5 : 8,
    });
  } else {
    blocks.push({ type: "spacer", height: ctx.compact ? 5 : 8 });
  }

  return [{ type: "keepTogether", blocks }];
}

function sectionBlocks(section: Section, ctx: Ctx): Block[] {
  if (section.hidden) return [];

  switch (section.kind) {
    case "summary": {
      if (!section.body.trim()) return [];
      return [
        sectionHeading(section.title, ctx),
        { type: "paragraph", runs: [text(section.body)], after: 4 },
      ];
    }

    case "experience": {
      if (section.items.length === 0) return [];
      return [
        sectionHeading(section.title, ctx),
        ...section.items.flatMap((item) => experienceBlocks(item, ctx)),
      ];
    }

    case "education": {
      if (section.items.length === 0) return [];
      return [
        sectionHeading(section.title, ctx),
        ...section.items.flatMap((item) => educationBlocks(item, ctx)),
      ];
    }

    case "projects": {
      if (section.items.length === 0) return [];
      return [
        sectionHeading(section.title, ctx),
        ...section.items.flatMap((item) => projectBlocks(item, ctx)),
      ];
    }

    case "skills": {
      const groups = section.groups.filter((g) => g.items.length > 0);
      if (groups.length === 0) return [];
      return [
        sectionHeading(section.title, ctx),
        // Written as "Label: a, b, c" rather than as a graphic or a rating
        // bar — parsers read text, and nobody believes a 4-out-of-5 anyway.
        ...groups.map<Block>((group) => ({
          type: "paragraph",
          runs: [
            ...(group.label ? [text(`${group.label}: `, { bold: true })] : []),
            text(group.items.join(", ")),
          ],
          after: 2,
        })),
        { type: "spacer", height: 3 },
      ];
    }

    case "list": {
      const items = section.items.filter((i) => i.trim());
      if (items.length === 0) return [];
      return [
        sectionHeading(section.title, ctx),
        {
          type: "bullets",
          items: items.map((i) => [text(i)]),
          gap: ctx.compact ? 1 : 2,
          after: 4,
        },
      ];
    }

    case "text": {
      if (!section.body.trim()) return [];
      return [
        sectionHeading(section.title, ctx),
        ...section.body
          .split(/\n{2,}/)
          .filter((p) => p.trim())
          .map<Block>((p) => ({ type: "paragraph", runs: [text(p.trim())], after: 4 })),
      ];
    }
  }
}

function contactLine(resume: Resume): string[] {
  const { contact } = resume;
  return [
    contact.email,
    contact.phone,
    contact.location,
    ...contact.links.map((l) => l.url || l.label),
  ].filter((p) => p.trim());
}

function headerBlocks(resume: Resume, ctx: Ctx, centred: boolean): Block[] {
  const { contact, options } = resume;
  const align = centred ? ("centre" as const) : ("left" as const);
  const blocks: Block[] = [];

  if (contact.name.trim()) {
    blocks.push({
      type: "heading",
      level: 1,
      runs: [text(contact.name)],
      align,
      after: 2,
    });
  }

  if (contact.headline.trim()) {
    blocks.push({
      type: "paragraph",
      runs: [text(contact.headline, { colour: options.accent, size: options.baseSize + 1 })],
      align,
      after: 4,
    });
  }

  const parts = contactLine(resume);
  if (parts.length > 0) {
    blocks.push({
      type: "paragraph",
      runs: joined(parts, "  ·  ", { colour: GREY, size: options.baseSize - 0.5 }),
      align,
      after: ctx.compact ? 6 : 10,
    });
  }

  return blocks;
}

/** The layout each template shares once the header is decided. */
function singleColumn(resume: Resume, ctx: Ctx, centredHeader: boolean): Block[] {
  return [
    ...headerBlocks(resume, ctx, centredHeader),
    ...resume.sections.flatMap((s) => sectionBlocks(s, ctx)),
  ];
}

function photoTemplate(resume: Resume, ctx: Ctx): Block[] {
  const { contact } = resume;
  const photo = resume.options.showPhoto ? contact.photo : undefined;

  if (!photo) return singleColumn(resume, ctx, false);

  // A two-cell table puts the photo beside the details without needing a
  // dedicated column primitive.
  const details: Inline[] = [];
  if (contact.name) details.push(text(contact.name, { bold: true, size: ctx.options.baseSize * 1.7 }));

  const header: Block = {
    type: "table",
    columns: [{ width: 1 }, { width: 92, fixed: true }],
    cellPadding: 0,
    rows: [
      [
        details,
        [], // the picture is drawn below; the cell reserves the space
      ],
    ],
    after: 0,
  };

  return [
    header,
    ...headerBlocks({ ...resume, contact: { ...contact, name: "" } }, ctx, false),
    {
      type: "image",
      data: Uint8Array.from(atob(photo.data), (c) => c.charCodeAt(0)),
      format: photo.format,
      width: 92,
      height: 118,
      align: "right",
      after: 6,
    },
    ...resume.sections.flatMap((s) => sectionBlocks(s, ctx)),
  ];
}

function twoColumnTemplate(resume: Resume, ctx: Ctx): Block[] {
  // Skills and short lists go in the sidebar; narrative sections stay in the
  // main column where they have room to breathe.
  const sidebarKinds = new Set(["skills", "list"]);
  const sidebar = resume.sections.filter((s) => !s.hidden && sidebarKinds.has(s.kind));
  const main = resume.sections.filter((s) => !s.hidden && !sidebarKinds.has(s.kind));

  const sidebarBlocks = sidebar.flatMap((s) => sectionBlocks(s, ctx));
  const mainBlocks = main.flatMap((s) => sectionBlocks(s, ctx));

  // Nothing to put in the sidebar means this is just the modern template.
  if (sidebarBlocks.length === 0) return singleColumn(resume, ctx, false);

  return [
    ...headerBlocks(resume, ctx, false),
    {
      type: "table",
      columns: [{ width: 165, fixed: true }, { width: 1 }],
      cellPadding: 8,
      rows: [
        [
          flattenToInlines(sidebarBlocks),
          flattenToInlines(mainBlocks),
        ],
      ],
    },
  ];
}

/**
 * Tables hold inline runs, not blocks, so a column's content is flattened to
 * text with line breaks. This is exactly the structure that confuses parsers,
 * which is why this template carries a warning.
 */
function flattenToInlines(blocks: Block[]): Inline[] {
  const out: Inline[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        out.push({ ...block.runs[0], bold: true });
        out.push(text("\n"));
        break;
      case "paragraph":
        out.push(...block.runs, text("\n"));
        break;
      case "bullets":
        for (const item of block.items) {
          out.push(text("• "), ...item, text("\n"));
        }
        break;
      case "keepTogether":
        out.push(...flattenToInlines(block.blocks));
        break;
      case "spacer":
        out.push(text("\n"));
        break;
      default:
        break;
    }
  }

  return out;
}

const TEMPLATE_BUILDERS: Record<TemplateId, (resume: Resume, ctx: Ctx) => Block[]> = {
  classic: (r, c) => singleColumn(r, c, true),
  modern: (r, c) => singleColumn(r, c, false),
  compact: (r, c) => singleColumn(r, c, false),
  academic: (r, c) => singleColumn(r, c, true),
  photo: photoTemplate,
  twoColumn: twoColumnTemplate,
};

export function buildResumeDocument(resume: Resume): DocumentSpec {
  const { options } = resume;
  const compact = options.template === "compact";

  const ctx: Ctx = {
    options,
    headingLevel: compact ? 3 : 2,
    compact,
  };

  const blocks = TEMPLATE_BUILDERS[options.template](resume, ctx);

  return {
    page: pageSetup(options.pageSize, compact ? Math.min(options.margin, 40) : options.margin),
    style: {
      ...DEFAULT_STYLE,
      family: options.family,
      baseSize: options.baseSize,
      lineHeight: options.lineHeight,
      accent: options.accent,
      headingScale: compact ? [1.6, 1.08, 1.02] : [1.9, 1.12, 1.05],
    },
    blocks,
    title: resume.contact.name ? `${resume.contact.name} — Resume` : "Resume",
    author: resume.contact.name || undefined,
  };
}
