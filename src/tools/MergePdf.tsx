import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { ToolShell } from "../components/ToolShell";
import { Button, Card, Notice, ProgressBar } from "../components/ui";
import { formatBytes, saveBlob } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import { getPdfWorker, proxy } from "../lib/workers";

const TOOL = getTool("merge-pdf")!;

interface Entry {
  id: string;
  file: File;
  /** null while counting, -1 if the file couldn't be read as a PDF. */
  pages: number | null;
}

let nextId = 0;
const makeId = () => `f${nextId++}`;

export default function MergePdf() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((incoming: File[]) => {
    const pdfs = incoming.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      setError("Those don’t look like PDF files. This tool only takes PDFs.");
      return;
    }

    setError(null);
    setResult(null);

    const added: Entry[] = pdfs.map((file) => ({ id: makeId(), file, pages: null }));
    setEntries((prev) => [...prev, ...added]);

    // Page counts fill in as they resolve — the list is usable immediately.
    const worker = getPdfWorker();
    for (const entry of added) {
      worker
        .pageCount(entry.file)
        .then((pages) => {
          setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, pages } : e)),
          );
        })
        .catch(() => {
          setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, pages: -1 } : e)),
          );
        });
    }
  }, []);

  // Pick up a file handed over from the homepage drop zone.
  useEffect(() => {
    const staged = claimFiles();
    if (staged) addFiles(staged);
  }, [addFiles]);

  const move = (index: number, delta: number) => {
    setEntries((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setResult(null);
  };

  const remove = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setResult(null);
  };

  const readable = entries.filter((e) => e.pages !== -1);
  const broken = entries.filter((e) => e.pages === -1);
  const totalPages = readable.reduce((sum, e) => sum + Math.max(e.pages ?? 0, 0), 0);
  const totalBytes = readable.reduce((sum, e) => sum + e.file.size, 0);

  const merge = async () => {
    if (readable.length < 2) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const worker = getPdfWorker();
      const bytes = await worker.merge(
        readable.map((e) => e.file),
        proxy((done: number, total: number) => setProgress((done / total) * 100)),
      );
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      setResult(blob);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `Merging failed: ${err.message}`
          : "Merging failed. One of these files may be damaged or password protected.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setEntries([]);
    setResult(null);
    setError(null);
    setProgress(0);
  };

  return (
    <ToolShell tool={TOOL}>
      {entries.length === 0 ? (
        <DropZone
          onFiles={addFiles}
          accept=".pdf,application/pdf"
          multiple
          title="Drop your PDFs here"
          hint="Pick two or more. There’s no limit on how many, or how big they are."
        />
      ) : (
        <div className="space-y-5">
          <Card>
            <ul className="divide-y divide-line">
              {entries.map((entry, i) => (
                <li key={entry.id} className="flex items-center gap-3 p-3 sm:px-4">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-faint">
                    {i + 1}
                  </span>
                  <FileText
                    className={
                      entry.pages === -1
                        ? "size-4 shrink-0 text-danger"
                        : "size-4 shrink-0 text-faint"
                    }
                    aria-hidden
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {entry.file.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatBytes(entry.file.size)}
                      {entry.pages === null && " · reading…"}
                      {entry.pages === -1 && (
                        <span className="text-danger"> · couldn’t read this file</span>
                      )}
                      {entry.pages !== null && entry.pages > 0 && (
                        <> · {entry.pages} {entry.pages === 1 ? "page" : "pages"}</>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === 0 || busy}
                      onClick={() => move(i, -1)}
                      aria-label={`Move ${entry.file.name} up`}
                      className="px-1.5"
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === entries.length - 1 || busy}
                      onClick={() => move(i, 1)}
                      aria-label={`Move ${entry.file.name} down`}
                      className="px-1.5"
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => remove(entry.id)}
                      aria-label={`Remove ${entry.file.name}`}
                      className="px-1.5"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5 sm:px-4">
              <p className="text-xs text-muted">
                {readable.length} {readable.length === 1 ? "file" : "files"}
                {totalPages > 0 && ` · ${totalPages} pages`} · {formatBytes(totalBytes)}
              </p>
              <label className="cursor-pointer">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink">
                  <Plus className="size-4" aria-hidden />
                  Add more
                </span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.files) addFiles(Array.from(e.target.files));
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </Card>

          {broken.length > 0 && (
            <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
              {broken.length === 1 ? "One file" : `${broken.length} files`} couldn’t be
              read and will be skipped. That usually means the file is damaged or
              needs a password to open.
            </Notice>
          )}

          {error && (
            <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
              {error}
            </Notice>
          )}

          {busy && (
            <div className="space-y-2">
              <ProgressBar percent={progress} />
              <p className="text-xs text-muted">
                Merging… {Math.round(progress)}%
              </p>
            </div>
          )}

          {result ? (
            <Card className="border-positive/30 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    Merged {readable.length} files into one PDF
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {totalPages > 0 && `${totalPages} pages · `}
                    {formatBytes(result.size)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() => saveBlob(result, "merged.pdf")}
                >
                  <Download className="size-4" aria-hidden />
                  Download merged.pdf
                </Button>
                <Button onClick={startOver}>Start over</Button>
              </div>
            </Card>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="lg"
                busy={busy}
                disabled={readable.length < 2}
                onClick={merge}
              >
                {busy ? "Merging…" : `Merge ${readable.length || ""} PDFs`.trim()}
              </Button>
              <Button size="lg" disabled={busy} onClick={startOver}>
                Clear
              </Button>
              {readable.length === 1 && (
                <p className="text-sm text-muted">Add at least one more PDF to merge.</p>
              )}
            </div>
          )}
        </div>
      )}
    </ToolShell>
  );
}
