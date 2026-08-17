import { AlertTriangle, PenLine, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { boxToPoints, PageCanvas, PageStepper, type Box } from "../components/PageCanvas";
import { usePdfDocument } from "../components/PdfThumb";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { SignaturePad } from "../components/SignaturePad";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Field,
  Notice,
  SegmentedControl,
  Slider,
  Spinner,
  TextInput,
} from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker } from "../lib/workers";

const TOOL = getTool("sign-pdf")!;

type Source = "draw" | "type" | "upload";

const TYPED_FONTS = [
  { value: "'Segoe Script', 'Brush Script MT', cursive", label: "Handwritten" },
  { value: "Georgia, serif", label: "Formal" },
  { value: "Inter, sans-serif", label: "Plain" },
];

/** Renders typed text to a transparent PNG at print resolution. */
async function typedSignature(
  text: string,
  fontFamily: string,
  colour: string,
): Promise<Blob | null> {
  if (!text.trim()) return null;

  const scale = 4;
  const fontSize = 44 * scale;
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return null;
  measure.font = `${fontSize}px ${fontFamily}`;
  const width = Math.ceil(measure.measureText(text).width) + 24 * scale;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(width, 40);
  canvas.height = Math.round(fontSize * 1.7);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = colour;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 12 * scale, canvas.height / 2);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export default function SignPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source>("draw");
  const [signature, setSignature] = useState<Blob | null>(null);
  const [typed, setTyped] = useState("");
  const [font, setFont] = useState(TYPED_FONTS[0].value);
  const [colour, setColour] = useState("#101010");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const job = useToolJob<OutputFile[]>();

  const pdf = usePdfDocument(file);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  // Re-render the typed signature whenever its look changes.
  useEffect(() => {
    if (source !== "type") return;
    let cancelled = false;
    void typedSignature(typed, font, colour).then((blob) => {
      if (!cancelled) setSignature(blob);
    });
    return () => {
      cancelled = true;
    };
  }, [source, typed, font, colour]);

  const handleDrawn = useCallback((blob: Blob | null) => setSignature(blob), []);

  const startOver = () => {
    setFile(null);
    setBoxes([]);
    setSignature(null);
    job.reset();
  };

  const apply = async () => {
    if (!file || !signature || boxes.length === 0 || !pdf.doc) return;

    await job.run(async () => {
      const data = await signature.arrayBuffer();

      // Each page can differ in size, so placements are converted per page.
      const placements = [];
      for (const box of boxes) {
        const pageObj = await pdf.doc!.getPage(box.page);
        const viewport = pageObj.getViewport({ scale: 1 });
        pageObj.cleanup();
        const points = boxToPoints(box, {
          width: viewport.width,
          height: viewport.height,
        });
        placements.push({ page: box.page, ...points });
      }

      const worker = getPdfWorker();
      const bytes = await worker.placeImage(
        file,
        { data, format: "png" },
        placements,
      );

      return [
        {
          name: `${baseNameOf(file.name)} (signed).pdf`,
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
          hint="Draw, type or upload a signature, then place it where it belongs."
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
          This draws your signature onto the page. It isn’t a cryptographic
          signature, so it proves nothing about who signed or when — which is fine
          for most everyday forms, and not enough for anything legally contested.
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
            headline={`Signed in ${boxes.length} ${boxes.length === 1 ? "place" : "places"}`}
            onStartOver={startOver}
          />
        ) : (
          pdf.doc && (
            <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <div className="space-y-4">
                <Card className="space-y-4 p-4">
                  <SegmentedControl
                    options={[
                      { value: "draw", label: "Draw" },
                      { value: "type", label: "Type" },
                      { value: "upload", label: "Upload" },
                    ]}
                    value={source}
                    onChange={(v) => setSource(v as Source)}
                  />

                  {source === "draw" && (
                    <SignaturePad onChange={handleDrawn} colour={colour} />
                  )}

                  {source === "type" && (
                    <div className="space-y-3">
                      <Field label="Your name">
                        {(id) => (
                          <TextInput
                            id={id}
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            placeholder="Asha Menon"
                          />
                        )}
                      </Field>
                      <div className="flex flex-wrap gap-1.5">
                        {TYPED_FONTS.map((f) => (
                          <button
                            key={f.label}
                            type="button"
                            onClick={() => setFont(f.value)}
                            style={{ fontFamily: f.value }}
                            className={
                              font === f.value
                                ? "rounded-full border border-accent bg-accent-wash px-3 py-1.5 text-sm text-accent touch:min-h-11"
                                : "rounded-full border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink touch:min-h-11"
                            }
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {source === "upload" && (
                    <DropZone
                      compact
                      accept="image/png,image/jpeg"
                      title="Drop a picture of your signature"
                      hint="A PNG with a transparent background works best."
                      onFiles={(files) => setSignature(files[0] ?? null)}
                    />
                  )}

                  <Field label="Ink colour">
                    {(id) => (
                      <div className="flex items-center gap-2">
                        <input
                          id={id}
                          type="color"
                          value={colour}
                          onChange={(e) => setColour(e.target.value)}
                          className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface p-1 touch:h-11 touch:w-14"
                        />
                        <span className="text-xs text-muted">
                          Blue is common on Indian forms; black photocopies better.
                        </span>
                      </div>
                    )}
                  </Field>
                </Card>

                <Card className="space-y-4 p-4">
                  <p className="text-sm font-medium text-ink">Placing it</p>
                  <p className="text-xs leading-relaxed text-muted">
                    {signature
                      ? "Click on the page to drop your signature, then drag out a box for a precise fit. Double-click a box to remove it."
                      : "Make a signature first, then click on the page to place it."}
                  </p>

                  <Slider
                    label="Size"
                    min={50}
                    max={200}
                    step={5}
                    value={Math.round(scale * 100)}
                    display={`${Math.round(scale * 100)}%`}
                    onChange={(e) => setScale(Number(e.target.value) / 100)}
                  />

                  {boxes.length > 0 && (
                    <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                      <p className="text-xs text-muted">
                        {boxes.length} placed on {new Set(boxes.map((b) => b.page)).size}{" "}
                        page(s)
                      </p>
                      <Button size="sm" onClick={() => setBoxes([])}>
                        <Trash2 className="size-4" aria-hidden />
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
                    disabled={!signature || boxes.length === 0}
                    onClick={apply}
                  >
                    <PenLine className="size-4" aria-hidden />
                    Sign the PDF
                  </Button>
                </Card>
              </div>

              <div className="min-w-0 space-y-3">
                <PageStepper
                  page={page}
                  total={pdf.pageCount}
                  onChange={setPage}
                  marked={[...new Set(boxes.map((b) => b.page))]}
                />

                <PageCanvas
                  doc={pdf.doc}
                  page={page}
                  boxes={boxes}
                  selectedId={selected}
                  mode="point"
                  label="Click to place your signature"
                  onAdd={(box) =>
                    setBoxes((b) => [
                      ...b,
                      {
                        ...box,
                        width: box.width * scale,
                        height: box.height * scale,
                        id: `s${Date.now()}${b.length}`,
                      },
                    ])
                  }
                  onSelect={setSelected}
                  onRemove={(id) => setBoxes((b) => b.filter((x) => x.id !== id))}
                />
              </div>
            </div>
          )
        )}
      </div>
    </ToolShell>
  );
}
