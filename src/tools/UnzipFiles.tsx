import { AlertTriangle, Download, FileArchive, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { ToolShell } from "../components/ToolShell";
import { Button, Card, Notice, ProgressBar, Spinner } from "../components/ui";
import { formatBytes, saveAllAsZip, saveBlob } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";

const TOOL = getTool("unzip-files")!;

interface Entry {
  path: string;
  size: number;
  extract: () => Promise<Blob>;
}

export default function UnzipFiles() {
  const [file, setFile] = useState<File | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  useEffect(() => {
    if (!file) {
      setEntries(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { default: JSZip } = await import("jszip");
        const zip = await JSZip.loadAsync(file);
        if (cancelled) return;

        const found: Entry[] = [];
        zip.forEach((path, entry) => {
          // Directory entries and macOS metadata are noise, not content.
          if (entry.dir || path.startsWith("__MACOSX/") || path.endsWith(".DS_Store")) {
            return;
          }
          found.push({
            path,
            size: (entry as unknown as { _data?: { uncompressedSize?: number } })._data
              ?.uncompressedSize ?? 0,
            extract: () => entry.async("blob"),
          });
        });

        setEntries(found.sort((a, b) => a.path.localeCompare(b.path)));
      } catch {
        if (!cancelled) {
          setError(
            "This doesn't open as a zip. It may be damaged, password protected, or a different kind of archive — RAR and 7z aren't readable in a browser.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  const extractAll = async () => {
    if (!entries) return;
    setExtracting(true);
    setProgress(0);

    try {
      const out: Array<{ name: string; blob: Blob }> = [];
      for (const [index, entry] of entries.entries()) {
        out.push({ name: entry.path.split("/").pop() || entry.path, blob: await entry.extract() });
        setProgress(((index + 1) / entries.length) * 100);
      }
      await saveAllAsZip(out, "extracted.zip");
    } finally {
      setExtracting(false);
    }
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept=".zip,application/zip"
          title="Drop a .zip here"
          hint="Look inside and pull out just what you need."
        />
      </ToolShell>
    );
  }

  const total = entries?.reduce((s, e) => s + e.size, 0) ?? 0;

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <FileHeader
          file={file}
          detail={entries ? `${entries.length} files inside` : undefined}
          onClear={() => {
            setFile(null);
            setEntries(null);
            setError(null);
          }}
          disabled={extracting}
        />

        {error && (
          <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
            {error}
          </Notice>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Spinner /> Reading the archive…
          </div>
        )}

        {entries && entries.length === 0 && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
            This zip is empty.
          </Notice>
        )}

        {entries && entries.length > 0 && (
          <>
            <Card>
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {entries.map((entry) => (
                  <li key={entry.path} className="flex items-center gap-3 p-2.5 sm:px-4">
                    <FolderOpen className="size-4 shrink-0 text-faint" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{entry.path}</p>
                      {entry.size > 0 && (
                        <p className="text-xs text-muted">{formatBytes(entry.size)}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="px-1.5"
                      disabled={extracting}
                      onClick={async () =>
                        saveBlob(
                          await entry.extract(),
                          entry.path.split("/").pop() || entry.path,
                        )
                      }
                      aria-label={`Save ${entry.path}`}
                    >
                      <Download className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>

              <p className="border-t border-line px-3 py-2.5 text-xs text-muted sm:px-4">
                {entries.length} files · {formatBytes(total)} unpacked
              </p>
            </Card>

            {extracting && (
              <div className="space-y-1.5">
                <ProgressBar percent={progress} />
                <p className="text-xs text-muted">Extracting… {Math.round(progress)}%</p>
              </div>
            )}

            <Button variant="primary" size="lg" busy={extracting} onClick={extractAll}>
              <FileArchive className="size-4" aria-hidden />
              Extract everything
            </Button>
          </>
        )}
      </div>
    </ToolShell>
  );
}
