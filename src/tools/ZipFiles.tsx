import { AlertTriangle, FileArchive, Plus, X } from "lucide-react";
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
  Slider,
  TextInput,
} from "../components/ui";
import { formatBytes } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";

const TOOL = getTool("zip-files")!;

/** Formats that are already compressed and won't shrink further. */
const ALREADY_COMPRESSED = /\.(jpe?g|png|gif|webp|avif|heic|mp4|mkv|mov|webm|mp3|m4a|aac|ogg|flac|zip|rar|7z|gz)$/i;

export default function ZipFiles() {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("archive");
  const [level, setLevel] = useState(6);
  const job = useToolJob<OutputFile[]>();

  const add = useCallback((incoming: File[]) => {
    setFiles((prev) => [...prev, ...incoming]);
  }, []);

  useEffect(() => {
    const staged = claimFiles();
    if (staged) add(staged);
  }, [add]);

  const total = files.reduce((s, f) => s + f.size, 0);
  const compressible = files.filter((f) => !ALREADY_COMPRESSED.test(f.name));

  const make = async () => {
    if (files.length === 0) return;

    await job.run(async (report) => {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      // Two files with the same name would silently overwrite each other.
      const used = new Set<string>();
      for (const file of files) {
        let entry = file.name;
        let n = 2;
        while (used.has(entry)) {
          const dot = file.name.lastIndexOf(".");
          entry =
            dot > 0
              ? `${file.name.slice(0, dot)} (${n})${file.name.slice(dot)}`
              : `${file.name} (${n})`;
          n++;
        }
        used.add(entry);
        zip.file(entry, file);
      }

      const blob = await zip.generateAsync(
        {
          type: "blob",
          compression: level === 0 ? "STORE" : "DEFLATE",
          compressionOptions: { level: Math.max(level, 1) },
        },
        (meta) => report(Math.round(meta.percent), 100),
      );

      return [{ name: `${name || "archive"}.zip`, blob }];
    });
  };

  if (files.length === 0) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={add}
          multiple
          title="Drop your files here"
          hint="Bundle anything into one .zip — handy when a form only accepts a single upload."
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
            headline={`${files.length} files in one zip`}
            detail={`${formatBytes(total)} → ${formatBytes(job.result[0].blob.size)}`}
            onStartOver={() => {
              setFiles([]);
              job.reset();
            }}
          />
        ) : (
          <>
            <Card>
              <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center gap-3 p-2.5 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{file.name}</p>
                      <p className="text-xs text-muted">{formatBytes(file.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-1.5"
                      disabled={job.busy}
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5 sm:px-4">
                <p className="text-xs text-muted">
                  {files.length} files · {formatBytes(total)}
                </p>
                <label className="cursor-pointer">
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink touch:h-11">
                    <Plus className="size-4" aria-hidden />
                    Add more
                  </span>
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    disabled={job.busy}
                    onChange={(e) => {
                      if (e.target.files) add(Array.from(e.target.files));
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </Card>

            <Card className="space-y-4 p-5">
              <Field label="Name the zip">
                {(id) => (
                  <TextInput
                    id={id}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="archive"
                  />
                )}
              </Field>

              <Slider
                label="Compression"
                min={0}
                max={9}
                step={1}
                value={level}
                display={level === 0 ? "none — just bundle" : `${level}`}
                onChange={(e) => setLevel(Number(e.target.value))}
              />
              <p className="-mt-2 text-xs leading-relaxed text-muted">
                Higher takes longer for very little extra saving. Level 6 is the
                usual default and the right answer almost always.
              </p>
            </Card>

            {compressible.length === 0 && level > 0 && (
              <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
                These are all photos, video or audio, which are compressed already —
                zipping won’t make them meaningfully smaller. It’s still useful for
                bundling them into one upload, so consider setting compression to
                none and saving the wait.
              </Notice>
            )}

            {job.error && (
              <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                {job.error}
              </Notice>
            )}

            {job.busy && (
              <div className="space-y-1.5">
                <ProgressBar percent={job.progress ?? 0} />
                <p className="text-xs text-muted">Zipping… {Math.round(job.progress ?? 0)}%</p>
              </div>
            )}

            <Button variant="primary" size="lg" busy={job.busy} onClick={make}>
              <FileArchive className="size-4" aria-hidden />
              Make the zip
            </Button>
          </>
        )}
      </div>
    </ToolShell>
  );
}
