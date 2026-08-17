import { AlertTriangle, Hash } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { PdfThumb, usePdfDocument } from "../components/PdfThumb";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Field,
  Notice,
  Select,
  Slider,
  Spinner,
  TextInput,
} from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { parsePageRanges } from "../lib/pageRanges";
import type { Corner } from "../lib/pdfOps";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker } from "../lib/workers";

const TOOL = getTool("page-numbers")!;

const CORNERS: Array<{ value: Corner; label: string }> = [
  { value: "bottom-centre", label: "Bottom, centred" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "top-centre", label: "Top, centred" },
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" },
];

const FORMATS = [
  { value: "{n}", label: "1, 2, 3" },
  { value: "Page {n}", label: "Page 1, Page 2" },
  { value: "{n} of {total}", label: "1 of 10" },
  { value: "Page {n} of {total}", label: "Page 1 of 10" },
  { value: "— {n} —", label: "— 1 —" },
];

/** Where the number sits, drawn over a thumbnail so the choice is obvious. */
function CornerPreview({ position }: { position: Corner }) {
  const [vertical, horizontal] = position.split("-");
  return (
    <div
      className="pointer-events-none absolute inset-0 flex p-[6%]"
      style={{
        alignItems: vertical === "top" ? "flex-start" : "flex-end",
        justifyContent:
          horizontal === "left" ? "flex-start" : horizontal === "right" ? "flex-end" : "center",
      }}
    >
      <span className="rounded bg-accent px-1.5 py-0.5 text-[0.625rem] font-medium text-accent-ink shadow">
        1
      </span>
    </div>
  );
}

export default function PageNumbers() {
  const [file, setFile] = useState<File | null>(null);
  const [position, setPosition] = useState<Corner>("bottom-centre");
  const [format, setFormat] = useState("{n}");
  const [startAt, setStartAt] = useState(1);
  const [fontSize, setFontSize] = useState(11);
  const [margin, setMargin] = useState(32);
  const [skipInput, setSkipInput] = useState("");
  const job = useToolJob<OutputFile[]>();

  const pdf = usePdfDocument(file);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  const skip = useMemo(
    () => parsePageRanges(skipInput, pdf.pageCount),
    [skipInput, pdf.pageCount],
  );

  const startOver = () => {
    setFile(null);
    setSkipInput("");
    job.reset();
  };

  const apply = async () => {
    if (!file) return;
    const stem = baseNameOf(file.name);

    await job.run(async () => {
      const worker = getPdfWorker();
      const bytes = await worker.addPageNumbers(file, {
        position,
        startAt,
        skipPages: skip.pages,
        fontSize,
        margin,
        format,
      });
      return [
        {
          name: `${stem} (numbered).pdf`,
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        },
      ];
    });
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept=".pdf,application/pdf"
          title="Drop a PDF here"
          hint="Numbers go on every page, unless you tell it to skip a cover."
        />
      </ToolShell>
    );
  }

  const numbered = Math.max(pdf.pageCount - skip.pages.length, 0);

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <FileHeader
          file={file}
          detail={pdf.pageCount > 0 ? `${pdf.pageCount} pages` : undefined}
          onClear={startOver}
          disabled={job.busy}
        />

        {pdf.error && (
          <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
            {pdf.error}
          </Notice>
        )}

        {pdf.needsPassword && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
            This PDF needs a password to open. Use the{" "}
            <a href="/t/unlock-pdf" className="font-medium underline underline-offset-2">
              Remove password
            </a>{" "}
            tool on it first.
          </Notice>
        )}

        {pdf.loading && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Spinner /> Reading the document…
          </div>
        )}

        {job.result ? (
          <ResultCard
            files={job.result}
            headline={`Numbered ${numbered} ${numbered === 1 ? "page" : "pages"}`}
            onStartOver={startOver}
          />
        ) : (
          pdf.doc && (
            <div className="grid gap-6 lg:grid-cols-[1fr_14rem]">
              <Card className="order-2 space-y-5 p-5 lg:order-1">
                <Field label="Where should the number go?">
                  {(id) => (
                    <Select
                      id={id}
                      value={position}
                      onChange={(e) => setPosition(e.target.value as Corner)}
                    >
                      {CORNERS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="How should it look?">
                  {(id) => (
                    <Select id={id} value={format} onChange={(e) => setFormat(e.target.value)}>
                      {FORMATS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Start counting from" hint="Useful when this is part two of a longer document.">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="number"
                        min={0}
                        value={startAt}
                        onChange={(e) => setStartAt(Math.max(0, Number(e.target.value) || 0))}
                      />
                    )}
                  </Field>

                  <Field
                    label="Leave these pages blank"
                    hint="A cover page, usually. Type 1, or 1-2."
                  >
                    {(id) => (
                      <TextInput
                        id={id}
                        value={skipInput}
                        onChange={(e) => setSkipInput(e.target.value)}
                        placeholder="1"
                        inputMode="numeric"
                      />
                    )}
                  </Field>
                </div>

                {skip.error && (
                  <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                    {skip.error}
                  </Notice>
                )}

                <Slider
                  label="Text size"
                  min={7}
                  max={24}
                  step={1}
                  value={fontSize}
                  display={`${fontSize} pt`}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />

                <Slider
                  label="Distance from the edge"
                  min={12}
                  max={80}
                  step={4}
                  value={margin}
                  display={`${Math.round((margin / 72) * 25.4)} mm`}
                  onChange={(e) => setMargin(Number(e.target.value))}
                />

                <p className="text-sm text-muted">
                  {numbered} of {pdf.pageCount} pages will be numbered
                  {skip.pages.length > 0 && `, starting at ${startAt}`}.
                </p>

                {job.error && (
                  <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                    {job.error}
                  </Notice>
                )}

                <Button
                  variant="primary"
                  size="lg"
                  busy={job.busy}
                  disabled={!!skip.error || numbered === 0}
                  onClick={apply}
                >
                  <Hash className="size-4" aria-hidden />
                  Add the numbers
                </Button>
              </Card>

              <div className="order-1 lg:order-2 lg:sticky lg:top-24 lg:self-start">
                <p className="mb-2 text-sm font-medium text-ink">Preview</p>
                <div className="relative max-w-[14rem]">
                  <PdfThumb doc={pdf.doc} page={1} width={224} className="border border-line" />
                  <CornerPreview position={position} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  The marker shows roughly where the number lands on the page.
                </p>
              </div>
            </div>
          )
        )}
      </div>
    </ToolShell>
  );
}
