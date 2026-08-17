import { AlertTriangle, ClipboardCopy, Film, Music } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { ToolShell } from "../components/ToolShell";
import { Button, Card, Notice, Spinner } from "../components/ui";
import { formatBytes } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import {
  formatBitrate,
  formatTimecode,
  readMediaInfo,
  unsupportedFormat,
  type MediaInfo as Info,
} from "../lib/media";
import { getTool } from "../lib/registry";

const TOOL = getTool("media-info")!;

interface Row {
  file: File;
  info: Info | null;
  error: string | null;
}

function describe(row: Row): string {
  if (!row.info) return `${row.file.name}: ${row.error ?? "unreadable"}`;
  const lines = [
    row.file.name,
    `  Size      ${formatBytes(row.file.size)}`,
    `  Length    ${formatTimecode(row.info.duration)}`,
    `  Format    ${row.info.format}`,
    `  Bitrate   ${formatBitrate(row.info.bitrate)}`,
  ];
  for (const track of row.info.tracks) {
    lines.push(
      track.kind === "video"
        ? `  Video     ${track.codec ?? "unknown"} · ${track.width}×${track.height}${
            track.frameRate ? ` · ${Math.round(track.frameRate)} fps` : ""
          }`
        : `  Audio     ${track.codec ?? "unknown"} · ${track.channels} ch · ${track.sampleRate} Hz`,
    );
  }
  return lines.join("\n");
}

export default function MediaInfoTool() {
  const [rows, setRows] = useState<Row[]>([]);
  const [copied, setCopied] = useState(false);

  const add = (files: File[]) => {
    const started: Row[] = files.map((file) => ({ file, info: null, error: null }));
    setRows((prev) => [...prev, ...started]);

    for (const row of started) {
      const blocked = unsupportedFormat(row.file);
      if (blocked) {
        setRows((prev) =>
          prev.map((r) =>
            r.file === row.file
              ? { ...r, error: `${blocked} can't be opened in a browser.` }
              : r,
          ),
        );
        continue;
      }

      readMediaInfo(row.file)
        .then((info) =>
          setRows((prev) => prev.map((r) => (r.file === row.file ? { ...r, info } : r))),
        )
        .catch(() =>
          setRows((prev) =>
            prev.map((r) =>
              r.file === row.file
                ? { ...r, error: "Couldn't read this file." }
                : r,
            ),
          ),
        );
    }
  };

  useEffect(() => {
    const staged = claimFiles();
    if (staged) add(staged);
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyAll = async () => {
    await navigator.clipboard.writeText(rows.map(describe).join("\n\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (rows.length === 0) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={add}
          accept="video/*,audio/*"
          multiple
          title="Drop videos or audio files here"
          hint="See exactly what's inside — codec, resolution, bitrate and length."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-4">
        {rows.map((row) => (
          <Card key={row.file.name + row.file.size} className="p-4">
            <div className="flex items-start gap-3">
              {row.info?.tracks.some((t) => t.kind === "video") ? (
                <Film className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
              ) : (
                <Music className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{row.file.name}</p>

                {row.error ? (
                  <p className="mt-1 text-xs text-danger">{row.error}</p>
                ) : row.info ? (
                  <>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-faint">Size</dt>
                        <dd className="text-ink">{formatBytes(row.file.size)}</dd>
                      </div>
                      <div>
                        <dt className="text-faint">Length</dt>
                        <dd className="text-ink">{formatTimecode(row.info.duration)}</dd>
                      </div>
                      <div>
                        <dt className="text-faint">Format</dt>
                        <dd className="truncate text-ink">{row.info.format}</dd>
                      </div>
                      <div>
                        <dt className="text-faint">Bitrate</dt>
                        <dd className="text-ink">{formatBitrate(row.info.bitrate)}</dd>
                      </div>
                    </dl>

                    <ul className="mt-3 space-y-1 border-t border-line pt-2">
                      {row.info.tracks.map((track, i) => (
                        <li key={i} className="text-xs text-muted">
                          <span className="font-medium text-ink">
                            {track.kind === "video" ? "Video" : "Audio"}
                          </span>{" "}
                          — {track.codec ?? "unknown codec"}
                          {track.kind === "video" &&
                            ` · ${track.width} × ${track.height}${
                              track.frameRate ? ` · ${Math.round(track.frameRate)} fps` : ""
                            }`}
                          {track.kind === "audio" &&
                            ` · ${track.channels === 1 ? "mono" : `${track.channels} channels`} · ${track.sampleRate?.toLocaleString()} Hz`}
                          {track.languageCode &&
                            track.languageCode !== "und" &&
                            ` · ${track.languageCode}`}
                        </li>
                      ))}
                      {row.info.tracks.length === 0 && (
                        <li className="text-xs text-warning">
                          No readable tracks in this file.
                        </li>
                      )}
                    </ul>
                  </>
                ) : (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                    <Spinner className="size-4" /> Reading…
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        {rows.some((r) => r.error) && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
            Some formats predate the video engines browsers ship with, so nothing in
            a browser can open them — that’s a limit of the platform rather than of
            this tool.
          </Notice>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={copyAll}>
            <ClipboardCopy className="size-4" aria-hidden />
            {copied ? "Copied" : "Copy the details"}
          </Button>
          <Button onClick={() => setRows([])}>Start over</Button>
        </div>
      </div>
    </ToolShell>
  );
}
