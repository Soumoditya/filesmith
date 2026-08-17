import { AlertTriangle, Play, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { DropZone } from "../../components/DropZone";
import { ResultCard, type OutputFile } from "../../components/ResultCard";
import { ToolShell } from "../../components/ToolShell";
import { Button, Card, Notice, ProgressBar } from "../../components/ui";
import { baseNameOf, formatBytes, kindOf } from "../../lib/files";
import { claimFiles } from "../../lib/handoff";
import { imageSize } from "../../lib/image";
import type { Size } from "../../lib/imageMath";
import type { ToolDef } from "../../lib/registry";
import { useToolJob } from "../../lib/useToolJob";

/**
 * The shape every batch image tool shares: drop pictures in, adjust options,
 * process them all, download.
 *
 * Convert, compress, resize, rotate and watermark differ only in their
 * options panel and the work they do per file, so they configure this rather
 * than each reimplementing file lists, previews and progress.
 */

export interface ImageEntry {
  id: string;
  file: File;
  url: string;
  size: Size | null;
}

export interface BatchResult extends OutputFile {
  originalBytes: number;
  size?: Size;
}

let nextId = 0;

export function BatchImageTool({
  tool,
  dropTitle,
  dropHint,
  caveat,
  options,
  actionLabel,
  process,
  summary,
  wide = false,
}: {
  tool: ToolDef;
  dropTitle: string;
  dropHint: string;
  caveat?: ReactNode;
  /** The tool's own controls, given the loaded files for context. */
  options: (entries: ImageEntry[]) => ReactNode;
  actionLabel: (count: number) => string;
  process: (entry: ImageEntry) => Promise<BatchResult>;
  /** Optional line under the results headline. */
  summary?: (results: BatchResult[]) => ReactNode;
  wide?: boolean;
}) {
  const [entries, setEntries] = useState<ImageEntry[]>([]);
  const job = useToolJob<BatchResult[]>();

  const addFiles = useCallback((incoming: File[]) => {
    const images = incoming.filter((f) => kindOf(f) === "image");
    if (images.length === 0) return;

    const added = images.map((file) => ({
      id: `i${nextId++}`,
      file,
      url: URL.createObjectURL(file),
      size: null as Size | null,
    }));
    setEntries((prev) => [...prev, ...added]);

    // Dimensions fill in as they resolve; the list is usable immediately.
    for (const entry of added) {
      imageSize(entry.file)
        .then((size) =>
          setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, size } : e)),
          ),
        )
        .catch(() => {
          /* Unreadable files are reported when processing runs. */
        });
    }
  }, []);

  useEffect(() => {
    const staged = claimFiles();
    if (staged) addFiles(staged);
  }, [addFiles]);

  useEffect(() => {
    return () => {
      setEntries((prev) => {
        for (const entry of prev) URL.revokeObjectURL(entry.url);
        return prev;
      });
    };
  }, []);

  const startOver = () => {
    for (const entry of entries) URL.revokeObjectURL(entry.url);
    setEntries([]);
    job.reset();
  };

  const run = async () => {
    if (entries.length === 0) return;

    await job.run(async (report) => {
      const out: BatchResult[] = [];
      const failures: string[] = [];

      for (const [index, entry] of entries.entries()) {
        try {
          out.push(await process(entry));
        } catch {
          // One bad file shouldn't lose the whole batch.
          failures.push(entry.file.name);
        }
        report(index + 1, entries.length);
      }

      if (out.length === 0) {
        throw new Error(
          failures.length === 1
            ? `${failures[0]} couldn't be read as an image.`
            : "None of these could be read as images.",
        );
      }

      return out;
    });
  };

  if (entries.length === 0) {
    return (
      <ToolShell tool={tool} caveat={caveat}>
        <DropZone
          onFiles={addFiles}
          accept="image/*,.heic,.heif"
          multiple
          title={dropTitle}
          hint={dropHint}
        />
      </ToolShell>
    );
  }

  const totalBefore = entries.reduce((s, e) => s + e.file.size, 0);
  const totalAfter = job.result?.reduce((s, r) => s + r.blob.size, 0) ?? 0;

  return (
    <ToolShell tool={tool} caveat={caveat} wide={wide}>
      <div className="space-y-5">
        <Card>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 p-2.5 sm:px-4">
                <img
                  src={entry.url}
                  alt=""
                  className="checkerboard size-11 shrink-0 rounded border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {entry.file.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatBytes(entry.file.size)}
                    {entry.size && ` · ${entry.size.width} × ${entry.size.height}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-1.5"
                  disabled={job.busy}
                  onClick={() => {
                    URL.revokeObjectURL(entry.url);
                    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
                  }}
                  aria-label={`Remove ${entry.file.name}`}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5 sm:px-4">
            <p className="text-xs text-muted">
              {entries.length} {entries.length === 1 ? "picture" : "pictures"} ·{" "}
              {formatBytes(totalBefore)}
            </p>
            <label className="cursor-pointer">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink touch:h-11">
                <Plus className="size-4" aria-hidden />
                Add more
              </span>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="sr-only"
                disabled={job.busy}
                onChange={(e) => {
                  if (e.target.files) addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </Card>

        {job.result ? (
          <ResultCard
            files={job.result}
            headline={`${job.result.length} ${job.result.length === 1 ? "picture" : "pictures"} ready`}
            detail={
              summary?.(job.result) ??
              `${formatBytes(totalBefore)} → ${formatBytes(totalAfter)}`
            }
            onStartOver={startOver}
          />
        ) : (
          <>
            {options(entries)}

            {job.error && (
              <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                {job.error}
              </Notice>
            )}

            {job.busy && (
              <div className="space-y-1.5">
                <ProgressBar percent={job.progress ?? 0} />
                <p className="text-xs text-muted">
                  {Math.round((((job.progress ?? 0) / 100) * entries.length))} of{" "}
                  {entries.length} done
                </p>
              </div>
            )}

            <Button variant="primary" size="lg" busy={job.busy} onClick={run}>
              <Play className="size-4" aria-hidden />
              {actionLabel(entries.length)}
            </Button>
          </>
        )}
      </div>
    </ToolShell>
  );
}

/** Names an output after its input, with the new extension. */
export function outputName(file: File, extension: string, suffix = ""): string {
  return `${baseNameOf(file.name)}${suffix}.${extension}`;
}
