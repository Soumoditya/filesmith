import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  Info,
  Plus,
  RotateCcw,
  Save,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocPreview, useDocumentPreview } from "../components/DocPreview";
import { ToolShell } from "../components/ToolShell";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Notice,
  SegmentedControl,
  Select,
  Slider,
  TextInput,
  Textarea,
} from "../components/ui";
import { FAMILIES, type FontFamily } from "../lib/doc/fontCatalogue";
import type { PageSizeName } from "../lib/doc/model";
import {
  clearDraft,
  loadDraft,
  readSavedFile,
  toSavedFile,
  useAutosave,
  useRelativeTime,
} from "../lib/draft";
import { saveBlob } from "../lib/files";
import { getTool } from "../lib/registry";
import { checkResume, countFindings, type AtsFinding } from "../lib/resume/ats";
import {
  ADDABLE_SECTIONS,
  emptyResume,
  makeSection,
  newId,
  sampleResume,
  type Resume,
  type Section,
  type TemplateId,
} from "../lib/resume/model";
import { buildResumeDocument, TEMPLATES, templateInfo } from "../lib/resume/templates";
import {
  EducationEditor,
  ExperienceEditor,
  ListEditor,
  ProjectsEditor,
  SectionFrame,
  SkillsEditor,
} from "./resume/SectionEditors";

const TOOL = getTool("resume-maker")!;
const DRAFT_KEY = "resume";

type Tab = "content" | "design" | "check";

const FINDING_STYLES: Record<AtsFinding["level"], { icon: typeof Info; tone: string }> = {
  problem: { icon: AlertTriangle, tone: "text-danger" },
  warning: { icon: Info, tone: "text-warning" },
  good: { icon: CheckCircle2, tone: "text-positive" },
};

export default function ResumeBuilder() {
  const [resume, setResume] = useState<Resume>(() => loadDraft<Resume>(DRAFT_KEY) ?? sampleResume());
  const [tab, setTab] = useState<Tab>("content");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const openInput = useRef<HTMLInputElement>(null);

  const draft = useAutosave(DRAFT_KEY, resume);
  const savedAgo = useRelativeTime(draft.savedAt);

  const spec = useMemo(() => buildResumeDocument(resume), [resume]);
  const { pages, result, building, error } = useDocumentPreview(spec);

  const findings = useMemo(
    () => checkResume(resume, result?.pageCount),
    [resume, result?.pageCount],
  );
  const counts = countFindings(findings);
  const template = templateInfo(resume.options.template);

  // Keep the tab badge honest as problems appear and disappear.
  useEffect(() => {
    document.title = resume.contact.name
      ? `${resume.contact.name} — Resume builder — Filesmith`
      : "Resume builder — Filesmith";
  }, [resume.contact.name]);

  const patchContact = (changes: Partial<Resume["contact"]>) =>
    setResume((r) => ({ ...r, contact: { ...r.contact, ...changes } }));

  const patchOptions = (changes: Partial<Resume["options"]>) =>
    setResume((r) => ({ ...r, options: { ...r.options, ...changes } }));

  const replaceSection = (index: number, next: Section) =>
    setResume((r) => ({
      ...r,
      sections: r.sections.map((s, i) => (i === index ? next : s)),
    }));

  const moveSection = (index: number, delta: number) =>
    setResume((r) => {
      const target = index + delta;
      if (target < 0 || target >= r.sections.length) return r;
      const sections = [...r.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...r, sections };
    });

  const removeSection = (index: number) =>
    setResume((r) => ({ ...r, sections: r.sections.filter((_, i) => i !== index) }));

  const exportPdf = async () => {
    setExporting("pdf");
    try {
      const { renderDocument } = await import("../lib/doc/render");
      const rendered = await renderDocument(spec);
      const name = resume.contact.name.trim() || "resume";
      saveBlob(new Blob([rendered.bytes as BlobPart], { type: "application/pdf" }), `${name}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  const exportDocx = async () => {
    setExporting("docx");
    try {
      const { resumeToDocx } = await import("../lib/resume/docx");
      const blob = await resumeToDocx(resume);
      const name = resume.contact.name.trim() || "resume";
      saveBlob(blob, `${name}.docx`);
    } finally {
      setExporting(null);
    }
  };

  const saveCopy = () => {
    const name = resume.contact.name.trim() || "resume";
    saveBlob(toSavedFile("resume", resume), `${name}.filesmith-resume.json`);
  };

  const openCopy = async (file: File) => {
    try {
      setResume(await readSavedFile<Resume>(file, "resume"));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "That file couldn't be opened.");
    }
  };

  const startFresh = (kind: "empty" | "sample") => {
    clearDraft(DRAFT_KEY);
    setResume(kind === "empty" ? emptyResume() : sampleResume());
    setLoadError(null);
  };

  return (
    <ToolShell tool={TOOL} wide>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_28rem]">
        {/* ------------------------------------------------------- Editor */}
        <div className="min-w-0 space-y-5">
          <div className="scroll-x -mx-1 px-1 pb-1">
            <SegmentedControl
              options={[
                { value: "content", label: "Content" },
                { value: "design", label: "Design" },
                {
                  value: "check",
                  label:
                    counts.problems + counts.warnings > 0
                      ? `Check (${counts.problems + counts.warnings})`
                      : "Check ✓",
                },
              ]}
              value={tab}
              onChange={(v) => setTab(v as Tab)}
            />
          </div>

          {loadError && (
            <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
              {loadError}
            </Notice>
          )}

          {tab === "content" && (
            <>
              <Card className="space-y-4 p-4">
                <h2 className="text-sm font-semibold text-ink">Your details</h2>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name">
                    {(id) => (
                      <TextInput
                        id={id}
                        value={resume.contact.name}
                        onChange={(e) => patchContact({ name: e.target.value })}
                        placeholder="Asha Menon"
                      />
                    )}
                  </Field>
                  <Field label="What you do" hint="A job title, not a sentence.">
                    {(id) => (
                      <TextInput
                        id={id}
                        value={resume.contact.headline}
                        onChange={(e) => patchContact({ headline: e.target.value })}
                        placeholder="Operations Analyst"
                      />
                    )}
                  </Field>
                  <Field label="Email">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="email"
                        value={resume.contact.email}
                        onChange={(e) => patchContact({ email: e.target.value })}
                        placeholder="you@example.com"
                      />
                    )}
                  </Field>
                  <Field label="Phone">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="tel"
                        value={resume.contact.phone}
                        onChange={(e) => patchContact({ phone: e.target.value })}
                        placeholder="+91 98765 43210"
                      />
                    )}
                  </Field>
                </div>

                <Field label="Where you are" hint="City and country is plenty — no street address.">
                  {(id) => (
                    <TextInput
                      id={id}
                      value={resume.contact.location}
                      onChange={(e) => patchContact({ location: e.target.value })}
                      placeholder="Bengaluru, India"
                    />
                  )}
                </Field>

                <Field label="Links" hint="One per line. LinkedIn, a portfolio, GitHub.">
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={2}
                      value={resume.contact.links.map((l) => l.url).join("\n")}
                      onChange={(e) =>
                        patchContact({
                          links: e.target.value
                            .split("\n")
                            .map((url) => url.trim())
                            .filter(Boolean)
                            .map((url) => ({ label: url, url })),
                        })
                      }
                      placeholder={"linkedin.com/in/you\nyourname.example.com"}
                    />
                  )}
                </Field>
              </Card>

              {resume.sections.map((section, index) => (
                <SectionFrame
                  key={section.id}
                  section={section}
                  index={index}
                  total={resume.sections.length}
                  onChange={(next) => replaceSection(index, next)}
                  onMove={(delta) => moveSection(index, delta)}
                  onRemove={() => removeSection(index)}
                >
                  {section.kind === "summary" && (
                    <Field
                      label="Summary"
                      hint="Two or three lines. Who you are, and the achievement you're proudest of."
                    >
                      {(id) => (
                        <Textarea
                          id={id}
                          rows={4}
                          value={section.body}
                          onChange={(e) =>
                            replaceSection(index, { ...section, body: e.target.value })
                          }
                        />
                      )}
                    </Field>
                  )}

                  {section.kind === "experience" && (
                    <ExperienceEditor
                      items={section.items}
                      onChange={(items) => replaceSection(index, { ...section, items })}
                    />
                  )}

                  {section.kind === "education" && (
                    <EducationEditor
                      items={section.items}
                      onChange={(items) => replaceSection(index, { ...section, items })}
                    />
                  )}

                  {section.kind === "projects" && (
                    <ProjectsEditor
                      items={section.items}
                      onChange={(items) => replaceSection(index, { ...section, items })}
                    />
                  )}

                  {section.kind === "skills" && (
                    <SkillsEditor
                      groups={section.groups}
                      onChange={(groups) => replaceSection(index, { ...section, groups })}
                    />
                  )}

                  {section.kind === "list" && (
                    <ListEditor
                      items={section.items}
                      onChange={(items) => replaceSection(index, { ...section, items })}
                    />
                  )}

                  {section.kind === "text" && (
                    <Field label="Text" hint="Leave a blank line between paragraphs.">
                      {(id) => (
                        <Textarea
                          id={id}
                          rows={4}
                          value={section.body}
                          onChange={(e) =>
                            replaceSection(index, { ...section, body: e.target.value })
                          }
                        />
                      )}
                    </Field>
                  )}
                </SectionFrame>
              ))}

              <Card className="p-4">
                <h2 className="text-sm font-semibold text-ink">Add a section</h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ADDABLE_SECTIONS.map((option) => (
                    <button
                      key={`${option.kind}-${option.title}`}
                      type="button"
                      title={option.hint}
                      onClick={() =>
                        setResume((r) => ({
                          ...r,
                          sections: [
                            ...r.sections,
                            { ...makeSection(option.kind, option.title), id: newId() },
                          ],
                        }))
                      }
                      className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent touch:min-h-11"
                    >
                      <Plus className="size-3.5" aria-hidden />
                      {option.title}
                    </button>
                  ))}
                </div>
              </Card>
            </>
          )}

          {tab === "design" && (
            <>
              <Card className="p-4">
                <h2 className="text-sm font-semibold text-ink">Template</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {TEMPLATES.map((option) => {
                    const active = resume.options.template === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => patchOptions({ template: option.id as TemplateId })}
                        className={
                          active
                            ? "rounded-lg border border-accent bg-accent-wash p-3 text-left"
                            : "rounded-lg border border-line p-3 text-left transition-colors hover:border-faint"
                        }
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{option.name}</span>
                          {!option.atsSafe && <Badge>Risky</Badge>}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {!template.atsSafe && template.warning && (
                  <Notice tone="warning" icon={<AlertTriangle className="size-4" />} className="mt-3">
                    {template.warning}
                  </Notice>
                )}
              </Card>

              <Card className="space-y-5 p-4">
                <h2 className="text-sm font-semibold text-ink">Type and spacing</h2>

                <Field
                  label="Font"
                  hint={FAMILIES.find((f) => f.id === resume.options.family)?.note}
                >
                  {(id) => (
                    <Select
                      id={id}
                      value={resume.options.family}
                      onChange={(e) => patchOptions({ family: e.target.value as FontFamily })}
                    >
                      {FAMILIES.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                          {f.atsSafe ? "" : " — not ideal for job applications"}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Slider
                  label="Text size"
                  min={8}
                  max={13}
                  step={0.5}
                  value={resume.options.baseSize}
                  display={`${resume.options.baseSize} pt`}
                  onChange={(e) => patchOptions({ baseSize: Number(e.target.value) })}
                />

                <Slider
                  label="Line spacing"
                  min={1.05}
                  max={1.7}
                  step={0.05}
                  value={resume.options.lineHeight}
                  display={resume.options.lineHeight.toFixed(2)}
                  onChange={(e) => patchOptions({ lineHeight: Number(e.target.value) })}
                />

                <Slider
                  label="Page margin"
                  min={24}
                  max={80}
                  step={4}
                  value={resume.options.margin}
                  display={`${Math.round((resume.options.margin / 72) * 25.4)} mm`}
                  onChange={(e) => patchOptions({ margin: Number(e.target.value) })}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Paper size">
                    {(id) => (
                      <Select
                        id={id}
                        value={resume.options.pageSize}
                        onChange={(e) =>
                          patchOptions({ pageSize: e.target.value as PageSizeName })
                        }
                      >
                        <option value="a4">A4 — most of the world</option>
                        <option value="letter">Letter — US and Canada</option>
                      </Select>
                    )}
                  </Field>

                  <Field label="Dates">
                    {(id) => (
                      <Select
                        id={id}
                        value={resume.options.dateStyle}
                        onChange={(e) =>
                          patchOptions({
                            dateStyle: e.target.value as Resume["options"]["dateStyle"],
                          })
                        }
                      >
                        <option value="short">Mar 2024</option>
                        <option value="long">March 2024</option>
                        <option value="numeric">03/2024</option>
                      </Select>
                    )}
                  </Field>
                </div>

                <Checkbox
                  label="Draw a line under each section heading"
                  checked={resume.options.headingRules}
                  onChange={(e) => patchOptions({ headingRules: e.target.checked })}
                />
              </Card>
            </>
          )}

          {tab === "check" && (
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-ink">
                Will a machine read this properly?
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Most applications are read by software before a person sees them. These
                are the things that commonly trip it up.
              </p>

              <ul className="mt-4 space-y-3">
                {findings.map((finding, i) => {
                  const { icon: Icon, tone } = FINDING_STYLES[finding.level];
                  return (
                    <li
                      key={`${finding.title}-${i}`}
                      className="flex items-start gap-2.5 rounded-lg border border-line p-3"
                    >
                      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{finding.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted">
                          {finding.detail}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        {/* ------------------------------------------------------ Preview */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" busy={exporting === "pdf"} onClick={exportPdf}>
                <Download className="size-4" aria-hidden />
                PDF
              </Button>
              <Button busy={exporting === "docx"} onClick={exportDocx}>
                <FileText className="size-4" aria-hidden />
                Word
              </Button>
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              Send the PDF to a person, and the Word file to a job board — applicant
              tracking systems read .docx most reliably.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
              <Button size="sm" onClick={saveCopy}>
                <Save className="size-4" aria-hidden />
                Save a copy
              </Button>
              <Button size="sm" onClick={() => openInput.current?.click()}>
                <FolderOpen className="size-4" aria-hidden />
                Open
              </Button>
              <Button size="sm" onClick={() => startFresh("empty")}>
                <RotateCcw className="size-4" aria-hidden />
                Start blank
              </Button>
              <input
                ref={openInput}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void openCopy(file);
                  e.target.value = "";
                }}
              />
            </div>

            <p className="mt-3 text-xs text-muted">
              {draft.pending
                ? "Saving…"
                : draft.savedAt
                  ? `Draft saved in this browser ${savedAgo}.`
                  : "Your draft saves automatically as you type."}
            </p>
          </Card>

          <DocPreview
            pages={pages}
            building={building}
            error={error}
            warnings={result?.warnings}
            emptyMessage="Your resume appears here as you type."
          />

          {result && (
            <p className="text-center text-xs text-muted">
              {result.pageCount} {result.pageCount === 1 ? "page" : "pages"}
            </p>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
