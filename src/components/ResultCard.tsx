import { CheckCircle2, Download, FileArchive } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatBytes, saveAllAsZip, saveBlob } from "../lib/files";
import { Button, Card, ProgressBar } from "./ui";

export interface OutputFile {
  name: string;
  blob: Blob;
}

/**
 * The finished state, shared by every tool. One output gets a download
 * button; several get individual buttons plus "download all as a zip".
 */
export function ResultCard({
  files,
  headline,
  detail,
  onStartOver,
  children,
}: {
  files: OutputFile[];
  headline: string;
  detail?: ReactNode;
  onStartOver: () => void;
  children?: ReactNode;
}) {
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const totalBytes = files.reduce((sum, f) => sum + f.blob.size, 0);
  const single = files.length === 1;

  const downloadAll = async () => {
    setZipping(true);
    setZipProgress(0);
    try {
      await saveAllAsZip(files, "filesmith.zip", setZipProgress);
    } finally {
      setZipping(false);
    }
  };

  return (
    <Card className="border-positive/30 p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{headline}</p>
          <p className="mt-0.5 text-xs text-muted">
            {detail ?? `${formatBytes(totalBytes)}`}
          </p>
        </div>
      </div>

      {children && <div className="mt-4">{children}</div>}

      {!single && (
        <ul className="mt-4 max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{file.name}</span>
                <span className="block text-xs text-muted">
                  {formatBytes(file.blob.size)}
                </span>
              </span>
              <Button
                size="sm"
                onClick={() => saveBlob(file.blob, file.name)}
                aria-label={`Download ${file.name}`}
              >
                <Download className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {zipping && (
        <div className="mt-4 space-y-1.5">
          <ProgressBar percent={zipProgress} />
          <p className="text-xs text-muted">Zipping… {Math.round(zipProgress)}%</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {single ? (
          <Button variant="primary" onClick={() => saveBlob(files[0].blob, files[0].name)}>
            <Download className="size-4" aria-hidden />
            Download {files[0].name}
          </Button>
        ) : (
          <Button variant="primary" busy={zipping} onClick={downloadAll}>
            <FileArchive className="size-4" aria-hidden />
            Download all {files.length} as a zip
          </Button>
        )}
        <Button onClick={onStartOver}>Start over</Button>
      </div>
    </Card>
  );
}
