import { AlertTriangle, Trash2, Type } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { boxToPoints, PageCanvas, PageStepper, type Box } from "../components/PageCanvas";
import { usePdfDocument } from "../components/PdfThumb";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Checkbox,
  Field,
  Notice,
  Slider,
  Spinner,
  TextInput,
} from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker } from "../lib/workers";

const TOOL = getTool("edit-pdf-text")!;

interface Edit extends Box {
  text: string;
  fontSize: number;
  cover: boolean;
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255 || 0,
    g: parseInt(full.slice(2, 4), 16) / 255 || 0,
    b: parseInt(full.slice(4, 6), 16) / 255 || 0,
  };
}

export default function EditPdfText() {
  const [file, setFile] = useState<File | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [colour, setColour] = useState("#101010");
  const [coverColour, setCoverColour] = useState("#ffffff");
  const job = useToolJob<OutputFile[]>();

  const pdf = usePdfDocument(file);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  const active = edits.find((e) => e.id === selected) ?? null;

  const patch = (id: string, changes: Partial<Edit>) =>
    setEdits((list) => list.map((e) => (e.id === id ? { ...e, ...changes } : e)));

  const startOver = () => {
    setFile(null);
    setEdits([]);
    setSelected(null);
    job.reset();
  };

  const apply = async () => {
    if (!file || !pdf.doc || edits.length === 0) return;

    await job.run(async () => {
      const payload = [];
      for (const edit of edits) {
        const pageObj = await pdf.doc!.getPage(edit.page);
        const viewport = pageObj.getViewport({ scale: 1 });
        pageObj.cleanup();
        const points = boxToPoints(edit, {
          width: viewport.width,
          height: viewport.height,
        });
        payload.push({
          page: edit.page,
          ...points,
          text: edit.text,
          fontSize: edit.fontSize,
          colour: hexToRgb(colour),
          cover: edit.cover ? hexToRgb(coverColour) : null,
        });
      }

      const bytes = await getPdfWorker().overlayText(file, payload);
      return [
        {
          name: `${baseNameOf(file.name)} (edited).pdf`,
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
          hint="Cover the wrong bit and type the right bit over it."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell
      tool={TOOL}
      wide
      caveat={
        <>
          This covers the old text and writes new text on top — it doesn’t rewrite
          the document, so the original words are still inside the file and can be
          extracted. Fine for fixing a date or a typo before printing. To remove
          something private, use{" "}
          <a href="/t/redact-pdf" className="font-medium underline underline-offset-2">
            Redact
          </a>{" "}
          instead, which genuinely destroys it.
        </>
      }
    >
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

        {pdf.loading && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Spinner /> Reading the document…
          </div>
        )}

        {job.result ? (
          <ResultCard
            files={job.result}
            headline={`Made ${edits.length} ${edits.length === 1 ? "change" : "changes"}`}
            onStartOver={startOver}
          />
        ) : (
          pdf.doc && (
            <div className="grid gap-6 lg:grid-cols-[21rem_minmax(0,1fr)]">
              <div className="space-y-4">
                <Card className="space-y-4 p-4">
                  {active ? (
                    <>
                      <Field label="What should it say?">
                        {(id) => (
                          <TextInput
                            id={id}
                            value={active.text}
                            autoFocus
                            onChange={(e) => patch(active.id, { text: e.target.value })}
                            placeholder="Type the replacement"
                          />
                        )}
                      </Field>

                      <Slider
                        label="Text size"
                        min={6}
                        max={36}
                        step={1}
                        value={active.fontSize}
                        display={`${active.fontSize} pt`}
                        onChange={(e) =>
                          patch(active.id, { fontSize: Number(e.target.value) })
                        }
                      />

                      <Checkbox
                        label="Cover what's underneath"
                        checked={active.cover}
                        onChange={(e) => patch(active.id, { cover: e.target.checked })}
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Text colour">
                          {(id) => (
                            <input
                              id={id}
                              type="color"
                              value={colour}
                              onChange={(e) => setColour(e.target.value)}
                              className="h-10 w-full cursor-pointer rounded-lg border border-line-strong bg-surface p-1 touch:h-11"
                            />
                          )}
                        </Field>
                        <Field label="Cover colour">
                          {(id) => (
                            <input
                              id={id}
                              type="color"
                              value={coverColour}
                              onChange={(e) => setCoverColour(e.target.value)}
                              className="h-10 w-full cursor-pointer rounded-lg border border-line-strong bg-surface p-1 touch:h-11"
                            />
                          )}
                        </Field>
                      </div>

                      <p className="text-xs leading-relaxed text-muted">
                        Match the cover colour to the page background — usually white,
                        but sample it if the page is tinted.
                      </p>

                      <Button
                        size="sm"
                        onClick={() => {
                          setEdits((l) => l.filter((e) => e.id !== active.id));
                          setSelected(null);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Remove this change
                      </Button>
                    </>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-ink">Make a change</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted">
                        Drag a box over the text you want to replace, then type what it
                        should say instead. Click any existing box to edit it again, or
                        double-click to remove it.
                      </p>
                    </div>
                  )}

                  {edits.length > 0 && (
                    <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                      <p className="text-xs text-muted">
                        {edits.length} {edits.length === 1 ? "change" : "changes"}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => {
                          setEdits([]);
                          setSelected(null);
                        }}
                      >
                        Clear all
                      </Button>
                    </div>
                  )}

                  {job.error && (
                    <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                      {job.error}
                    </Notice>
                  )}

                  <Button
                    variant="primary"
                    size="lg"
                    busy={job.busy}
                    disabled={edits.length === 0}
                    onClick={apply}
                  >
                    <Type className="size-4" aria-hidden />
                    Save the changes
                  </Button>
                </Card>
              </div>

              <div className="min-w-0 space-y-3">
                <PageStepper
                  page={page}
                  total={pdf.pageCount}
                  onChange={setPage}
                  marked={[...new Set(edits.map((e) => e.page))]}
                />

                <PageCanvas
                  doc={pdf.doc}
                  page={page}
                  boxes={edits}
                  selectedId={selected}
                  mode="draw"
                  label="Drag over the text you want to replace"
                  onAdd={(box) => {
                    const id = `e${Date.now()}${edits.length}`;
                    setEdits((l) => [
                      ...l,
                      { ...box, id, text: "", fontSize: 11, cover: true },
                    ]);
                    setSelected(id);
                  }}
                  onSelect={setSelected}
                  onRemove={(id) => {
                    setEdits((l) => l.filter((e) => e.id !== id));
                    if (selected === id) setSelected(null);
                  }}
                />
              </div>
            </div>
          )
        )}
      </div>
    </ToolShell>
  );
}
