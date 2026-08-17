import { AlertTriangle, ArrowDown, ArrowUp, FileOutput, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Field,
  Notice,
  ProgressBar,
  SegmentedControl,
  Select,
  Slider,
} from "../components/ui";
import { formatBytes, kindOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import type { ImagesToPdfOptions } from "../lib/pdfOps";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker, proxy } from "../lib/workers";

const TOOL = getTool("image-to-pdf")!;

interface Entry {
  id: string;
  file: File;
  url: string;
}

let nextId = 0;

const PAGE_SIZES: Array<{ value: ImagesToPdfOptions["pageSize"]; label: string }> = [
  { value: "fit", label: "Fit the picture" },
  { value: "a4", label: "A4" },
  { value: "letter", label: "Letter" },
];

export default function ImagesToPdf() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pageSize, setPageSize] = useState<ImagesToPdfOptions["pageSize"]>("a4");
  const [orientation, setOrientation] =
    useState<ImagesToPdfOptions["orientation"]>("auto");
  const [margin, setMargin] = useState(36);
  const job = useToolJob<OutputFile[]>();

  const addFiles = useCallback((incoming: File[]) => {
    const images = incoming.filter((f) => kindOf(f) === "image");
    if (images.length === 0) return;

    setEntries((prev) => [
      ...prev,
      ...images.map((file) => ({
        id: `i${nextId++}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  useEffect(() => {
    const staged = claimFiles();
    if (staged) addFiles(staged);
  }, [addFiles]);

  // Object URLs are only released when the component goes away; releasing
  // per-entry on removal would break the exit animation of the list.
  useEffect(() => {
    return () => {
      setEntries((prev) => {
        for (const e of prev) URL.revokeObjectURL(e.url);
        return prev;
      });
    };
  }, []);

  const move = (index: number, delta: number) =>
    setEntries((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (id: string) =>
    setEntries((prev) => prev.filter((e) => e.id !== id));

  const startOver = () => {
    for (const e of entries) URL.revokeObjectURL(e.url);
    setEntries([]);
    job.reset();
  };

  const convert = async () => {
    if (entries.length === 0) return;

    await job.run(async (report) => {
      const worker = getPdfWorker();
      const bytes = await worker.imagesToPdf(
        entries.map((e) => e.file),
        { pageSize, orientation, margin },
        proxy(report),
      );
      return [
        {
          name: entries.length === 1 ? "photo.pdf" : `${entries.length} photos.pdf`,
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        },
      ];
    });
  };

  const totalBytes = entries.reduce((sum, e) => sum + e.file.size, 0);

  if (entries.length === 0) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={addFiles}
          accept="image/*"
          multiple
          title="Drop your pictures here"
          hint="JPG, PNG, WebP, AVIF and HEIC. Each one becomes a page, in the order you arrange them."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        {job.result ? (
          <ResultCard
            files={job.result}
            headline={`${entries.length} ${entries.length === 1 ? "picture" : "pictures"} in one PDF`}
            onStartOver={startOver}
          />
        ) : (
          <>
            <Card>
              <ul className="divide-y divide-line">
                {entries.map((entry, i) => (
                  <li key={entry.id} className="flex items-center gap-3 p-3 sm:px-4">
                    <span className="w-5 shrink-0 text-right font-mono text-xs text-faint">
                      {i + 1}
                    </span>
                    <img
                      src={entry.url}
                      alt=""
                      className="checkerboard size-10 shrink-0 rounded border border-line object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {entry.file.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatBytes(entry.file.size)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-1.5"
                        disabled={i === 0 || job.busy}
                        onClick={() => move(i, -1)}
                        aria-label={`Move ${entry.file.name} up`}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-1.5"
                        disabled={i === entries.length - 1 || job.busy}
                        onClick={() => move(i, 1)}
                        aria-label={`Move ${entry.file.name} down`}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-1.5"
                        disabled={job.busy}
                        onClick={() => remove(entry.id)}
                        aria-label={`Remove ${entry.file.name}`}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5 sm:px-4">
                <p className="text-xs text-muted">
                  {entries.length} {entries.length === 1 ? "picture" : "pictures"} ·{" "}
                  {formatBytes(totalBytes)}
                </p>
                <label className="cursor-pointer">
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink">
                    <Plus className="size-4" aria-hidden />
                    Add more
                  </span>
                  <input
                    type="file"
                    accept="image/*"
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

            <Card className="space-y-5 p-5">
              <Field label="Page size" hint="“Fit the picture” makes each page exactly the shape of its photo — good for scans and screenshots.">
                {(id) => (
                  <Select
                    id={id}
                    value={pageSize}
                    onChange={(e) =>
                      setPageSize(e.target.value as ImagesToPdfOptions["pageSize"])
                    }
                  >
                    {PAGE_SIZES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              {pageSize !== "fit" && (
                <Field label="Orientation">
                  {() => (
                    <SegmentedControl
                      options={[
                        { value: "auto", label: "Match each photo" },
                        { value: "portrait", label: "Portrait" },
                        { value: "landscape", label: "Landscape" },
                      ]}
                      value={orientation}
                      onChange={(v) =>
                        setOrientation(v as ImagesToPdfOptions["orientation"])
                      }
                    />
                  )}
                </Field>
              )}

              <Slider
                label="Margin"
                min={0}
                max={96}
                step={6}
                value={margin}
                display={margin === 0 ? "none" : `${Math.round((margin / 72) * 25.4)} mm`}
                onChange={(e) => setMargin(Number(e.target.value))}
              />
            </Card>

            {job.error && (
              <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                {job.error}
              </Notice>
            )}

            {job.busy && (
              <div className="space-y-1.5">
                <ProgressBar percent={job.progress ?? 0} />
                <p className="text-xs text-muted">
                  Adding pictures… {Math.round(job.progress ?? 0)}%
                </p>
              </div>
            )}

            <Button variant="primary" size="lg" busy={job.busy} onClick={convert}>
              <FileOutput className="size-4" aria-hidden />
              Make the PDF
            </Button>
          </>
        )}
      </div>
    </ToolShell>
  );
}
