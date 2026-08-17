import { AlertTriangle, CheckCircle2, Target, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DropZone } from "../components/DropZone";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Field,
  Notice,
  ProgressBar,
  TextInput,
} from "../components/ui";
import { baseNameOf, formatBytes, kindOf, withExtension } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { compressImageToTarget, compressPdfToTarget } from "../lib/raster";
import { getTool } from "../lib/registry";
import { parseSize, SIZE_PRESETS } from "../lib/sizeTarget";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker, proxy } from "../lib/workers";

const TOOL = getTool("compress-to-size")!;

interface Outcome extends OutputFile {
  originalBytes: number;
  achieved: boolean;
  note: string;
}

export default function FitUnderSize() {
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState("2 MB");
  const [status, setStatus] = useState<string | null>(null);
  const job = useToolJob<Outcome[]>();

  useEffect(() => {
    const staged = claimFiles();
    if (staged) setFiles(staged);
  }, []);

  const targetBytes = useMemo(() => parseSize(target), [target]);
  const usable = files.filter((f) => {
    const kind = kindOf(f);
    return kind === "pdf" || kind === "image";
  });

  const startOver = () => {
    setFiles([]);
    setStatus(null);
    job.reset();
  };

  const run = async () => {
    if (!targetBytes || usable.length === 0) return;

    await job.run(async (report) => {
      const worker = getPdfWorker();
      const out: Outcome[] = [];

      for (const [index, file] of usable.entries()) {
        setStatus(`${file.name} — measuring…`);

        if (kindOf(file) === "image") {
          const result = await compressImageToTarget(file, targetBytes);
          out.push({
            name: withExtension(file.name, "jpg"),
            blob: result.blob,
            originalBytes: file.size,
            achieved: result.achieved,
            note: result.achieved
              ? `${Math.round(result.quality * 100)}% quality${result.scale < 1 ? `, ${Math.round(result.scale * 100)}% size` : ""}`
              : "Couldn't get under the limit, even at the lowest setting",
          });
        } else {
          const result = await compressPdfToTarget(file, targetBytes, {
            onAttempt: (attempt, bytes) =>
              setStatus(`${file.name} — try ${attempt}: ${formatBytes(bytes)}`),
          });

          const images = await Promise.all(
            result.pages.map(async (page) => ({
              data: await page.blob.arrayBuffer(),
              format: "jpg" as const,
            })),
          );
          const sizes = result.pages.map((p) => ({
            width: p.pointWidth,
            height: p.pointHeight,
          }));

          const bytes = await worker.rebuildFromPageImages(images, sizes, proxy(() => {}));
          const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });

          out.push({
            name: `${baseNameOf(file.name)} (small).pdf`,
            blob,
            originalBytes: file.size,
            achieved: blob.size <= targetBytes,
            note:
              blob.size <= targetBytes
                ? `${result.dpi} DPI, ${Math.round(result.quality * 100)}% quality`
                : "Couldn't get under the limit, even at the lowest setting",
          });
        }

        report(index + 1, usable.length);
      }

      setStatus(null);
      return out;
    });
  };

  if (files.length === 0) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={setFiles}
          accept=".pdf,application/pdf,image/*"
          multiple
          title="Drop your PDFs or pictures here"
          hint="Tell it the limit the form is asking for, and it works backwards to fit."
        />
      </ToolShell>
    );
  }

  const succeeded = job.result?.filter((r) => r.achieved).length ?? 0;
  const failed = (job.result?.length ?? 0) - succeeded;

  return (
    <ToolShell
      tool={TOOL}
      caveat={
        <>
          Getting under a hard limit means giving up some quality — there’s no way
          round that. This finds the best quality that still fits, rather than
          flattening everything to the lowest setting.
        </>
      }
    >
      <div className="space-y-5">
        <Card className="p-4">
          <p className="text-sm font-medium text-ink">
            {usable.length} {usable.length === 1 ? "file" : "files"} ·{" "}
            {formatBytes(usable.reduce((s, f) => s + f.size, 0))}
          </p>
          <ul className="mt-2 space-y-0.5">
            {usable.map((f) => (
              <li key={f.name} className="truncate text-xs text-muted">
                {f.name} — {formatBytes(f.size)}
              </li>
            ))}
          </ul>
          {files.length > usable.length && (
            <p className="mt-2 text-xs text-warning">
              {files.length - usable.length} file(s) skipped — this tool handles PDFs
              and pictures.
            </p>
          )}
        </Card>

        {job.result ? (
          <>
            {failed > 0 && (
              <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
                {failed} of {job.result.length} couldn’t get under {target}. They’re
                still included at the smallest setting available — try a slightly
                larger limit, or split the document into parts.
              </Notice>
            )}

            <ResultCard
              files={job.result}
              headline={
                failed === 0
                  ? `All ${succeeded} fit under ${target}`
                  : `${succeeded} of ${job.result.length} fit under ${target}`
              }
              onStartOver={startOver}
            >
              <ul className="space-y-1.5">
                {job.result.map((r) => (
                  <li key={r.name} className="flex items-start gap-2 text-xs">
                    {r.achieved ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />
                    ) : (
                      <XCircle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                    )}
                    <span className="min-w-0 text-muted">
                      <span className="text-ink">{r.name}</span> —{" "}
                      {formatBytes(r.originalBytes)} → {formatBytes(r.blob.size)} ·{" "}
                      {r.note}
                    </span>
                  </li>
                ))}
              </ul>
            </ResultCard>
          </>
        ) : (
          <>
            <Card className="space-y-4 p-5">
              <Field
                label="What's the limit?"
                hint="Type it however the form words it — 2mb, 500 KB, 1.5 MB."
              >
                {(id) => (
                  <TextInput
                    id={id}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="2 MB"
                  />
                )}
              </Field>

              <div className="flex flex-wrap gap-1.5">
                {SIZE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    title={p.note}
                    onClick={() => setTarget(p.label)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent touch:min-h-11"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {target && !targetBytes && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  Couldn’t read that as a size. Try “2 MB” or “500 KB”.
                </Notice>
              )}

              {targetBytes && (
                <p className="text-sm text-muted">
                  Aiming for {formatBytes(targetBytes)} or less per file.
                </p>
              )}
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
                  {status ?? "Working…"} It tries several settings to find the best one
                  that fits.
                </p>
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              busy={job.busy}
              disabled={!targetBytes || usable.length === 0}
              onClick={run}
            >
              <Target className="size-4" aria-hidden />
              Fit under {targetBytes ? formatBytes(targetBytes) : "the limit"}
            </Button>
          </>
        )}
      </div>
    </ToolShell>
  );
}
