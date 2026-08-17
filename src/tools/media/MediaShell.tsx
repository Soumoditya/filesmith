import { AlertTriangle, Ban, Film, Music } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { DropZone } from "../../components/DropZone";
import { ResultCard, type OutputFile } from "../../components/ResultCard";
import { ToolShell } from "../../components/ToolShell";
import {
  Button,
  Card,
  Notice,
  ProgressBar,
  Spinner,
} from "../../components/ui";
import { formatBytes } from "../../lib/files";
import { claimFiles } from "../../lib/handoff";
import {
  formatBitrate,
  formatTimecode,
  readMediaInfo,
  unsupportedFormat,
  type MediaInfo,
} from "../../lib/media";
import type { ToolDef } from "../../lib/registry";
import { useToolJob } from "../../lib/useToolJob";

/**
 * The frame every media tool wears: take a file, read what's in it, show the
 * options, run a long job with progress and a working cancel button.
 *
 * Cancel matters more here than anywhere else on the site. A video encode can
 * run for minutes, and a tool that can only be escaped by closing the tab is
 * a tool people stop trusting with big files.
 */

export interface MediaJobResult {
  files: OutputFile[];
  headline: string;
  detail?: ReactNode;
}

export function MediaShell({
  tool,
  accept,
  dropTitle,
  dropHint,
  caveat,
  wide,
  needs = "any",
  options,
  actionLabel,
  run,
}: {
  tool: ToolDef;
  accept: string;
  dropTitle: string;
  dropHint: string;
  caveat?: ReactNode;
  wide?: boolean;
  /** Refuses a file that hasn't got the track this tool needs. */
  needs?: "video" | "audio" | "any";
  options: (info: MediaInfo, file: File) => ReactNode;
  actionLabel: string;
  run: (
    file: File,
    info: MediaInfo,
    report: (fraction: number) => void,
    signal: AbortSignal,
  ) => Promise<MediaJobResult>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const job = useToolJob<MediaJobResult>();

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  useEffect(() => {
    if (!file) {
      setInfo(null);
      return;
    }

    const blocked = unsupportedFormat(file);
    if (blocked) {
      setReadError(
        `${blocked} files can't be opened in a browser — the format predates the video engines browsers ship with. Converting it to MP4 on a computer first is the only route.`,
      );
      setInfo(null);
      return;
    }

    let cancelled = false;
    setReading(true);
    setReadError(null);

    readMediaInfo(file)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {
        if (!cancelled) {
          setReadError(
            "This file couldn't be opened. It may be damaged, or use a codec this browser doesn't have.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const startOver = () => {
    controller?.abort();
    setFile(null);
    setInfo(null);
    setReadError(null);
    job.reset();
  };

  const start = async () => {
    if (!file || !info) return;
    const next = new AbortController();
    setController(next);

    await job.run(async (report) => {
      const result = await run(
        file,
        info,
        (fraction) => report(Math.round(fraction * 100), 100),
        next.signal,
      );
      if (next.signal.aborted) throw new Error("Cancelled.");
      return result;
    });

    setController(null);
  };

  const video = info?.tracks.find((t) => t.kind === "video");
  const audio = info?.tracks.find((t) => t.kind === "audio");
  const missing =
    info && ((needs === "video" && !video) || (needs === "audio" && !audio));

  if (!file) {
    return (
      <ToolShell tool={tool} caveat={caveat}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept={accept}
          title={dropTitle}
          hint={dropHint}
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={tool} caveat={caveat} wide={wide}>
      <div className="space-y-5">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            {video ? (
              <Film className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
            ) : (
              <Music className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{file.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {formatBytes(file.size)}
                {info && ` · ${formatTimecode(info.duration)}`}
                {video && ` · ${video.width} × ${video.height}`}
                {info?.bitrate && ` · ${formatBitrate(info.bitrate)}`}
              </p>
              {info && (
                <p className="mt-1 text-xs text-faint">
                  {info.format}
                  {video?.codec && ` · video ${video.codec}`}
                  {audio?.codec && ` · audio ${audio.codec}`}
                  {!audio && video && " · no sound"}
                </p>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={startOver} disabled={job.busy}>
              Change
            </Button>
          </div>
        </Card>

        {readError && (
          <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
            {readError}
          </Notice>
        )}

        {reading && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Spinner /> Reading the file…
          </div>
        )}

        {missing && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
            This file has no {needs} track, so there’s nothing for this tool to do.
          </Notice>
        )}

        {job.result ? (
          <ResultCard
            files={job.result.files}
            headline={job.result.headline}
            detail={job.result.detail}
            onStartOver={startOver}
          />
        ) : (
          info &&
          !missing && (
            <>
              {options(info, file)}

              {job.error && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  {job.error}
                </Notice>
              )}

              {job.busy ? (
                <div className="space-y-2">
                  <ProgressBar percent={job.progress ?? 0} />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted">
                      {Math.round(job.progress ?? 0)}% — this runs on your own
                      machine, so speed depends on it.
                    </p>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        controller?.abort();
                        job.reset();
                      }}
                    >
                      <Ban className="size-4" aria-hidden />
                      Stop
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="primary" size="lg" onClick={start}>
                  {actionLabel}
                </Button>
              )}
            </>
          )
        )}
      </div>
    </ToolShell>
  );
}
