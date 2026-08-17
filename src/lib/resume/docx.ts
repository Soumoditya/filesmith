import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { formatRange, type Resume, type Section } from "./model";

/**
 * Exports a resume as a .docx.
 *
 * Worth having alongside the PDF: applicant tracking systems parse Word
 * documents most reliably, and plenty of recruiters still ask for one. The
 * output is deliberately plain — a single column of styled paragraphs, no
 * tables, text boxes or graphics, since those are exactly what parsers choke
 * on. It will not look identical to the PDF, and that's the right trade.
 */

const GREY = "6C6560";

const HEADING_BORDER = {
  bottom: { style: BorderStyle.SINGLE, size: 6, space: 2, color: "CCCCCC" },
};

function heading(text: string, ruled: boolean): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    border: ruled ? HEADING_BORDER : undefined,
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22 })],
  });
}

function body(text: string, opts: { italics?: boolean; colour?: string; after?: number } = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 60 },
    children: [
      new TextRun({ text, italics: opts.italics, color: opts.colour, size: 20 }),
    ],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 20 })],
  });
}

function meta(parts: string[]): Paragraph | null {
  const kept = parts.filter((p) => p.trim());
  if (kept.length === 0) return null;
  return body(kept.join("  ·  "), { colour: GREY, after: 80 });
}

function sectionParagraphs(section: Section, resume: Resume): Paragraph[] {
  if (section.hidden) return [];
  const ruled = resume.options.headingRules;
  const dateStyle = resume.options.dateStyle;
  const out: Paragraph[] = [];

  switch (section.kind) {
    case "summary":
      if (!section.body.trim()) return [];
      out.push(heading(section.title, ruled), body(section.body, { after: 120 }));
      break;

    case "experience": {
      if (section.items.length === 0) return [];
      out.push(heading(section.title, ruled));
      for (const item of section.items) {
        out.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({ text: item.role, bold: true, size: 20 }),
              ...(item.organisation
                ? [new TextRun({ text: ` — ${item.organisation}`, size: 20 })]
                : []),
            ],
          }),
        );
        const m = meta([item.location, formatRange(item, dateStyle)]);
        if (m) out.push(m);
        for (const b of item.bullets.filter((b) => b.trim())) out.push(bullet(b));
        out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      }
      break;
    }

    case "education": {
      if (section.items.length === 0) return [];
      out.push(heading(section.title, ruled));
      for (const item of section.items) {
        out.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({ text: item.qualification, bold: true, size: 20 }),
              ...(item.institution
                ? [new TextRun({ text: ` — ${item.institution}`, size: 20 })]
                : []),
            ],
          }),
        );
        const m = meta([item.location, formatRange(item, dateStyle), item.grade]);
        if (m) out.push(m);
        if (item.notes.trim()) out.push(body(item.notes, { after: 100 }));
      }
      break;
    }

    case "projects": {
      if (section.items.length === 0) return [];
      out.push(heading(section.title, ruled));
      for (const item of section.items) {
        out.push(
          new Paragraph({
            spacing: { after: 20 },
            children: [
              new TextRun({ text: item.name, bold: true, size: 20 }),
              ...(item.role ? [new TextRun({ text: ` — ${item.role}`, size: 20 })] : []),
            ],
          }),
        );
        const m = meta([item.link, formatRange(item, dateStyle)]);
        if (m) out.push(m);
        for (const b of item.bullets.filter((b) => b.trim())) out.push(bullet(b));
        out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      }
      break;
    }

    case "skills": {
      const groups = section.groups.filter((g) => g.items.length > 0);
      if (groups.length === 0) return [];
      out.push(heading(section.title, ruled));
      for (const group of groups) {
        out.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              ...(group.label
                ? [new TextRun({ text: `${group.label}: `, bold: true, size: 20 })]
                : []),
              new TextRun({ text: group.items.join(", "), size: 20 }),
            ],
          }),
        );
      }
      break;
    }

    case "list": {
      const items = section.items.filter((i) => i.trim());
      if (items.length === 0) return [];
      out.push(heading(section.title, ruled));
      for (const item of items) out.push(bullet(item));
      break;
    }

    case "text": {
      if (!section.body.trim()) return [];
      out.push(heading(section.title, ruled));
      for (const p of section.body.split(/\n{2,}/).filter((p) => p.trim())) {
        out.push(body(p.trim(), { after: 100 }));
      }
      break;
    }
  }

  return out;
}

export async function resumeToDocx(resume: Resume): Promise<Blob> {
  const { contact } = resume;
  const children: Paragraph[] = [];

  if (contact.name.trim()) {
    children.push(
      new Paragraph({
        alignment:
          resume.options.template === "classic" || resume.options.template === "academic"
            ? AlignmentType.CENTER
            : AlignmentType.LEFT,
        spacing: { after: 40 },
        children: [new TextRun({ text: contact.name, bold: true, size: 36 })],
      }),
    );
  }

  if (contact.headline.trim()) {
    children.push(
      new Paragraph({
        alignment:
          resume.options.template === "classic" || resume.options.template === "academic"
            ? AlignmentType.CENTER
            : AlignmentType.LEFT,
        spacing: { after: 60 },
        children: [new TextRun({ text: contact.headline, size: 22 })],
      }),
    );
  }

  const contactParts = [
    contact.email,
    contact.phone,
    contact.location,
    ...contact.links.map((l) => l.url || l.label),
  ].filter((p) => p.trim());

  if (contactParts.length > 0) {
    children.push(
      new Paragraph({
        alignment:
          resume.options.template === "classic" || resume.options.template === "academic"
            ? AlignmentType.CENTER
            : AlignmentType.LEFT,
        spacing: { after: 160 },
        children: [
          new TextRun({ text: contactParts.join("  ·  "), color: GREY, size: 18 }),
        ],
      }),
    );
  }

  for (const section of resume.sections) {
    children.push(...sectionParagraphs(section, resume));
  }

  const doc = new Document({
    creator: "Filesmith",
    title: contact.name ? `${contact.name} — Resume` : "Resume",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 20 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
