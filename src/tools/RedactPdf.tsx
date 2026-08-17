import { AlertTriangle, Eraser, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { PageCanvas, PageStepper, type Box } from "../components/PageCanvas";
import { usePdfDocument } from "../components/PdfThumb";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Notice,
  ProgressBar,
  Slider,
  Spinner,
} from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { canvasToBlob, renderPageToCanvas } from "../lib/pdfRender";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker, proxy } from "../lib/workers";

const TOOL = getTool("redact-pdf")!;

export default function RedactPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [page, setPage] = useState(1);
  const [dpi, setDpi] = useState(200);
  const job = useToolJob<OutputFile[]>();

  const pdf = usePdfDocument(file);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  const startOver = () => {
    setFile(null);
    setBoxes([]);
    job.reset();
  };

  const redactedPages = [...new Set(boxes.map((b) => b.page))].sort((a, b) => a - b);

  const apply = async () => {
    if (!file || !pdf.doc || boxes.length === 0) return;

    await job.run(async (report) => {
      const replacements: Array<{
        page: number;
        data: ArrayBuffer;
        format: "png" | "jpg";
      }> = [];

      for (const [i, pageNumber] of redactedPages.entries()) {
        const pageObj = await pdf.doc!.getPage(pageNumber);
        const viewport = pageObj.getViewport({ scale: 1 });
        pageObj.cleanup();

        const canvas = await renderPageToCanvas(
          pdf.doc!,
          pageNumber,
          viewport.width * (dpi / 72),
        );

        // Burn the blackouts into the pixels. Once this canvas is encoded,
        // whatever was underneath no longer exists in any form.
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Your browser wouldn't give us a canvas to draw on.");
        ctx.fillStyle = "#000000";
        for (const box of boxes.filter((b) => b.page === pageNumber)) {
          ctx.fillRect(
            box.x * canvas.width,
            box.y * canvas.height,
            box.width * canvas.width,
            box.height * canvas.height,
          );
        }

        const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
        replacements.push({
          page: pageNumber,
          data: await blob.arrayBuffer(),
          format: "jpg",
        });

        report(i + 1, redactedPages.length + 1);
      }

      const worker = getPdfWorker();
      const bytes = await worker.replacePagesWithImages(
        file,
        replacements,
        proxy(() => {}),
      );

      return [
        {
          name: `${baseNameOf(file.name)} (redacted).pdf`,
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
          hint="Drag a box over anything private. It gets destroyed, not just covered."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={TOOL} wide>
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
          <>
            <Notice tone="positive" icon={<ShieldCheck className="size-4" />}>
              The blacked-out content is gone from the file, not hidden under a
              rectangle. Selecting or searching the redacted areas finds nothing,
              because there is nothing left to find.
            </Notice>
            <ResultCard
              files={job.result}
              headline={`Redacted ${boxes.length} ${boxes.length === 1 ? "area" : "areas"} across ${redactedPages.length} page(s)`}
              detail="Redacted pages are now images; the rest keep their real text."
              onStartOver={startOver}
            />
          </>
        ) : (
          pdf.doc && (
            <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
              <div className="space-y-4">
                <Card className="space-y-4 p-4">
                  <div>
                    <p className="text-sm font-medium text-ink">How this works</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">
                      Drag a box over anything you want gone. When you save, those
                      pages are flattened to images with the blackouts already burned
                      in — so the hidden text is genuinely destroyed rather than
                      sitting invisibly underneath.
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      Pages you don’t redact are left completely untouched and stay
                      searchable.
                    </p>
                  </div>

                  <Slider
                    label="Quality of redacted pages"
                    min={100}
                    max={300}
                    step={25}
                    value={dpi}
                    display={`${dpi} DPI`}
                    onChange={(e) => setDpi(Number(e.target.value))}
                  />

                  {boxes.length > 0 && (
                    <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                      <p className="text-xs text-muted">
                        {boxes.length} {boxes.length === 1 ? "area" : "areas"} on{" "}
                        {redactedPages.length} page(s)
                      </p>
                      <Button size="sm" onClick={() => setBoxes([])}>
                        <Trash2 className="size-4" aria-hidden />
                        Clear
                      </Button>
                    </div>
                  )}

                  {job.error && (
                    <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                      {job.error}
                    </Notice>
                  )}

                  {job.busy && (
                    <div className="space-y-1.5">
                      <ProgressBar percent={job.progress ?? 0} />
                      <p className="text-xs text-muted">Flattening redacted pages…</p>
                    </div>
                  )}

                  <Button
                    variant="primary"
                    size="lg"
                    busy={job.busy}
                    disabled={boxes.length === 0}
                    onClick={apply}
                  >
                    <Eraser className="size-4" aria-hidden />
                    Redact and save
                  </Button>
                </Card>
              </div>

              <div className="min-w-0 space-y-3">
                <PageStepper
                  page={page}
                  total={pdf.pageCount}
                  onChange={setPage}
                  marked={redactedPages}
                />

                <PageCanvas
                  doc={pdf.doc}
                  page={page}
                  boxes={boxes}
                  mode="draw"
                  label="Drag over anything you want removed"
                  boxClassName="!border-danger !bg-black/85"
                  onAdd={(box) =>
                    setBoxes((b) => [...b, { ...box, id: `r${Date.now()}${b.length}` }])
                  }
                  onRemove={(id) => setBoxes((b) => b.filter((x) => x.id !== id))}
                />

                <p className="text-xs text-muted">
                  Drag to mark an area. Double-click a box to remove it.
                </p>
              </div>
            </div>
          )
        )}
      </div>
    </ToolShell>
  );
}
