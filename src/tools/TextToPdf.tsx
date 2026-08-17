import { Download, FileUp, RotateCcw, Save } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DocPreview, useDocumentPreview } from "../components/DocPreview";
import { ToolShell } from "../components/ToolShell";
import {
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
import {
  DEFAULT_STYLE,
  pageSetup,
  type Align,
  type PageSizeName,
} from "../lib/doc/model";
import {
  clearDraft,
  loadDraft,
  useAutosave,
  useRelativeTime,
} from "../lib/draft";
import { saveBlob } from "../lib/files";
import { markdownToBlocks, SAMPLE_MARKDOWN, textStats } from "../lib/markdown";
import { getTool } from "../lib/registry";

const TOOL = getTool("text-to-pdf")!;
const DRAFT_KEY = "text-to-pdf";

interface Draft {
  source: string;
  title: string;
  family: FontFamily;
  baseSize: number;
  lineHeight: number;
  pageSize: PageSizeName;
  margin: number;
  align: Align;
  header: string;
  footer: string;
  pageNumbers: boolean;
  breakOnHeading: boolean;
  preserveLineBreaks: boolean;
}

const INITIAL: Draft = {
  source: SAMPLE_MARKDOWN,
  title: "",
  family: "serif",
  baseSize: 11,
  lineHeight: 1.45,
  pageSize: "a4",
  margin: 64,
  align: "left",
  header: "",
  footer: "",
  pageNumbers: true,
  breakOnHeading: false,
  preserveLineBreaks: false,
};

type Tab = "write" | "design";

export default function TextToPdf() {
  const [draft, setDraft] = useState<Draft>(() => loadDraft<Draft>(DRAFT_KEY) ?? INITIAL);
  const [tab, setTab] = useState<Tab>("write");
  const [exporting, setExporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const saved = useAutosave(DRAFT_KEY, draft);
  const savedAgo = useRelativeTime(saved.savedAt);

  const patch = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));

  const stats = useMemo(() => textStats(draft.source), [draft.source]);

  const spec = useMemo(() => {
    const blocks = markdownToBlocks(draft.source, {
      pageBreakOnHeading: draft.breakOnHeading,
      preserveLineBreaks: draft.preserveLineBreaks,
    }).map((block) =>
      block.type === "paragraph" ? { ...block, align: draft.align } : block,
    );

    return {
      page: pageSetup(draft.pageSize, draft.margin),
      style: {
        ...DEFAULT_STYLE,
        family: draft.family,
        baseSize: draft.baseSize,
        lineHeight: draft.lineHeight,
      },
      blocks,
      title: draft.title || undefined,
      header: draft.header ? { template: draft.header, skipFirst: true } : undefined,
      footer:
        draft.footer || draft.pageNumbers
          ? {
              template: draft.footer || "{n}",
              align: "centre" as const,
              skipFirst: !draft.footer && false,
            }
          : undefined,
    };
  }, [draft]);

  const { pages, result, building, error } = useDocumentPreview(spec, 600);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { renderDocument } = await import("../lib/doc/render");
      const rendered = await renderDocument(spec);
      saveBlob(
        new Blob([rendered.bytes as BlobPart], { type: "application/pdf" }),
        `${draft.title || "document"}.pdf`,
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <ToolShell
      tool={TOOL}
      wide
      caveat={
        <>
          The result is real, selectable text — not a picture of text. Most free
          converters produce the latter, which is why their output can’t be copied
          out of or searched.
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          <div className="scroll-x -mx-1 px-1 pb-1">
            <SegmentedControl
              options={[
                { value: "write", label: "Write" },
                { value: "design", label: "Design" },
              ]}
              value={tab}
              onChange={(v) => setTab(v as Tab)}
            />
          </div>

          {tab === "write" ? (
            <>
              <Card className="p-3">
                <Textarea
                  value={draft.source}
                  onChange={(e) => patch({ source: e.target.value })}
                  rows={24}
                  spellCheck
                  className="font-mono text-[0.8125rem] leading-relaxed"
                  aria-label="Your text"
                  placeholder="Type or paste your text here…"
                />
              </Card>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  {stats.words.toLocaleString()} words ·{" "}
                  {stats.characters.toLocaleString()} characters ·{" "}
                  {stats.readingMinutes} min read
                  {result && ` · ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => fileInput.current?.click()}>
                    <FileUp className="size-4" aria-hidden />
                    Open a text file
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      saveBlob(
                        new Blob([draft.source], { type: "text/markdown" }),
                        `${draft.title || "document"}.md`,
                      )
                    }
                  >
                    <Save className="size-4" aria-hidden />
                    Save the text
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      clearDraft(DRAFT_KEY);
                      setDraft({ ...INITIAL, source: "" });
                    }}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                    Clear
                  </Button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".txt,.md,.markdown,text/plain"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) patch({ source: await file.text() });
                    }}
                  />
                </div>
              </div>

              <Notice>
                Plain text works fine on its own. If you want structure, this
                understands Markdown: <code>#</code> for a heading,{" "}
                <code>**bold**</code>, <code>*italic*</code>, <code>-</code> for
                bullets, <code>1.</code> for numbers, <code>&gt;</code> for a quote,
                and pipe tables.
              </Notice>
            </>
          ) : (
            <>
              <Card className="space-y-5 p-4">
                <Field label="Title" hint="Shown in the PDF's properties and as the filename.">
                  {(id) => (
                    <TextInput
                      id={id}
                      value={draft.title}
                      onChange={(e) => patch({ title: e.target.value })}
                      placeholder="Untitled"
                    />
                  )}
                </Field>

                <Field label="Typeface" hint={FAMILIES.find((f) => f.id === draft.family)?.note}>
                  {(id) => (
                    <Select
                      id={id}
                      value={draft.family}
                      onChange={(e) => patch({ family: e.target.value as FontFamily })}
                    >
                      {FAMILIES.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Paper size">
                    {(id) => (
                      <Select
                        id={id}
                        value={draft.pageSize}
                        onChange={(e) => patch({ pageSize: e.target.value as PageSizeName })}
                      >
                        <option value="a4">A4</option>
                        <option value="letter">Letter</option>
                        <option value="legal">Legal</option>
                        <option value="a5">A5</option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Alignment">
                    {(id) => (
                      <Select
                        id={id}
                        value={draft.align}
                        onChange={(e) => patch({ align: e.target.value as Align })}
                      >
                        <option value="left">Left</option>
                        <option value="justify">Justified</option>
                        <option value="centre">Centred</option>
                        <option value="right">Right</option>
                      </Select>
                    )}
                  </Field>
                </div>

                <Slider
                  label="Text size"
                  min={8}
                  max={18}
                  step={0.5}
                  value={draft.baseSize}
                  display={`${draft.baseSize} pt`}
                  onChange={(e) => patch({ baseSize: Number(e.target.value) })}
                />

                <Slider
                  label="Line spacing"
                  min={1.1}
                  max={2.2}
                  step={0.05}
                  value={draft.lineHeight}
                  display={draft.lineHeight.toFixed(2)}
                  onChange={(e) => patch({ lineHeight: Number(e.target.value) })}
                />

                <Slider
                  label="Margin"
                  min={24}
                  max={120}
                  step={4}
                  value={draft.margin}
                  display={`${Math.round((draft.margin / 72) * 25.4)} mm`}
                  onChange={(e) => patch({ margin: Number(e.target.value) })}
                />
              </Card>

              <Card className="space-y-4 p-4">
                <h2 className="text-sm font-semibold text-ink">Headers and footers</h2>

                <Field
                  label="Header"
                  hint="Left blank for none. Use {n} for the page number and {total} for the count."
                >
                  {(id) => (
                    <TextInput
                      id={id}
                      value={draft.header}
                      onChange={(e) => patch({ header: e.target.value })}
                      placeholder="e.g. Meeting notes — March 2026"
                    />
                  )}
                </Field>

                <Field label="Footer">
                  {(id) => (
                    <TextInput
                      id={id}
                      value={draft.footer}
                      onChange={(e) => patch({ footer: e.target.value })}
                      placeholder="Page {n} of {total}"
                    />
                  )}
                </Field>

                <Checkbox
                  label="Number the pages"
                  checked={draft.pageNumbers}
                  onChange={(e) => patch({ pageNumbers: e.target.checked })}
                />
                <Checkbox
                  label="Start each main heading on a new page"
                  checked={draft.breakOnHeading}
                  onChange={(e) => patch({ breakOnHeading: e.target.checked })}
                />
                <Checkbox
                  label="Keep my line breaks exactly as typed"
                  checked={draft.preserveLineBreaks}
                  onChange={(e) => patch({ preserveLineBreaks: e.target.checked })}
                />
                <p className="-mt-2 pl-6 text-xs leading-relaxed text-muted">
                  Off, wrapped lines join into flowing paragraphs. On, every line
                  break is kept — right for poetry, addresses and code.
                </p>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-4">
            <Button
              variant="primary"
              busy={exporting}
              disabled={!draft.source.trim()}
              onClick={exportPdf}
            >
              <Download className="size-4" aria-hidden />
              Download PDF
            </Button>
            <p className="mt-3 text-xs text-muted">
              {saved.pending
                ? "Saving…"
                : saved.savedAt
                  ? `Draft saved ${savedAgo}.`
                  : "Saves automatically as you type."}
            </p>
          </Card>

          <DocPreview
            pages={pages}
            building={building}
            error={error}
            warnings={result?.warnings}
            emptyMessage="Start typing and your PDF appears here."
          />
        </div>
      </div>
    </ToolShell>
  );
}
