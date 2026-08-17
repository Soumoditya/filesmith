import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { PdfThumb, usePdfDocument } from "../components/PdfThumb";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import { Button, Notice, Spinner } from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import type { PageOp } from "../lib/pdfOps";
import { getPdfWorker } from "../lib/workers";

const TOOL = getTool("organise-pdf")!;

interface Tile extends PageOp {
  /** Stable across reordering, so React doesn't rebuild thumbnails. */
  key: string;
}

export default function OrganisePdf() {
  const [file, setFile] = useState<File | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [deleted, setDeleted] = useState<Tile[]>([]);
  const job = useToolJob<OutputFile[]>();

  const pdf = usePdfDocument(file);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  // Build the tile list once the document's page count is known.
  useEffect(() => {
    if (pdf.pageCount === 0) return;
    setTiles(
      Array.from({ length: pdf.pageCount }, (_, i) => ({
        key: `p${i + 1}`,
        source: i + 1,
        rotate: 0,
      })),
    );
    setDeleted([]);
  }, [pdf.pageCount]);

  const dirty =
    deleted.length > 0 ||
    tiles.some((t, i) => t.source !== i + 1 || t.rotate !== 0);

  const move = (index: number, delta: number) =>
    setTiles((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const rotate = (index: number) =>
    setTiles((prev) =>
      prev.map((t, i) => (i === index ? { ...t, rotate: (t.rotate + 90) % 360 } : t)),
    );

  // Both of these update two pieces of state. They must do so with two
  // independent calls: a setState updater has to be pure, and nesting one
  // inside the other makes React's double-invocation record the change twice.
  const remove = (index: number) => {
    const tile = tiles[index];
    if (!tile) return;
    setDeleted((d) => [...d, tile]);
    setTiles((prev) => prev.filter((_, i) => i !== index));
  };

  const undoDelete = () => {
    const last = deleted.at(-1);
    if (!last) return;
    setDeleted((d) => d.slice(0, -1));
    setTiles((t) => [...t, last]);
  };

  const resetChanges = () => {
    setTiles(
      Array.from({ length: pdf.pageCount }, (_, i) => ({
        key: `p${i + 1}`,
        source: i + 1,
        rotate: 0,
      })),
    );
    setDeleted([]);
    job.reset();
  };

  const startOver = () => {
    setFile(null);
    setTiles([]);
    setDeleted([]);
    job.reset();
  };

  const save = async () => {
    if (!file || tiles.length === 0) return;
    const stem = baseNameOf(file.name);

    await job.run(async () => {
      const worker = getPdfWorker();
      const bytes = await worker.organise(
        file,
        tiles.map(({ source, rotate: r }) => ({ source, rotate: r })),
      );
      return [
        {
          name: `${stem} (organised).pdf`,
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
          hint="Drag pages into a new order, turn the sideways ones, and throw out the rest."
        />
      </ToolShell>
    );
  }

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
            headline={`Saved with ${tiles.length} ${tiles.length === 1 ? "page" : "pages"}`}
            onStartOver={startOver}
          />
        ) : (
          pdf.doc && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  {tiles.length} {tiles.length === 1 ? "page" : "pages"} kept
                  {deleted.length > 0 && ` · ${deleted.length} removed`}
                </p>
                <div className="flex gap-2">
                  {deleted.length > 0 && (
                    <Button size="sm" onClick={undoDelete}>
                      <Undo2 className="size-4" aria-hidden />
                      Undo delete
                    </Button>
                  )}
                  {dirty && (
                    <Button size="sm" onClick={resetChanges}>
                      Reset
                    </Button>
                  )}
                </div>
              </div>

              {tiles.length === 0 ? (
                <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
                  You’ve removed every page. Put at least one back to save the file.
                </Notice>
              ) : (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {tiles.map((tile, i) => (
                    <li key={tile.key} className="group">
                      <div className="relative">
                        <PdfThumb
                          doc={pdf.doc!}
                          page={tile.source}
                          rotation={tile.rotate}
                          width={200}
                          className="border border-line"
                        />
                        <span className="absolute top-1.5 left-1.5 rounded bg-canvas/90 px-1.5 py-0.5 font-mono text-xs text-muted">
                          {i + 1}
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-1.5"
                          disabled={i === 0 || job.busy}
                          onClick={() => move(i, -1)}
                          aria-label={`Move page ${i + 1} earlier`}
                        >
                          <ArrowLeft className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-1.5"
                          disabled={job.busy}
                          onClick={() => rotate(i)}
                          aria-label={`Rotate page ${i + 1}`}
                        >
                          <RotateCw className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-1.5"
                          disabled={job.busy}
                          onClick={() => remove(i)}
                          aria-label={`Remove page ${i + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-1.5"
                          disabled={i === tiles.length - 1 || job.busy}
                          onClick={() => move(i, 1)}
                          aria-label={`Move page ${i + 1} later`}
                        >
                          <ArrowRight className="size-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
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
                disabled={tiles.length === 0 || !dirty}
                onClick={save}
              >
                <Save className="size-4" aria-hidden />
                {dirty ? "Save the new PDF" : "Make a change first"}
              </Button>
            </>
          )
        )}
      </div>
    </ToolShell>
  );
}
