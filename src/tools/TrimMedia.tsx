import { useState } from "react";
import { Card, Field, Notice, TextInput } from "../components/ui";
import { baseNameOf, extensionOf, formatBytes } from "../lib/files";
import {
  convertMedia,
  formatTimecode,
  parseTimecode,
  type AudioContainer,
  type VideoContainer,
} from "../lib/media";
import { getTool } from "../lib/registry";
import { MediaShell } from "./media/MediaShell";

const TOOL = getTool("trim-media")!;

export default function TrimMedia() {
  const [start, setStart] = useState("0:00");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState(0);

  const startSeconds = parseTimecode(start);
  const endSeconds = end.trim() ? parseTimecode(end) : duration;

  const valid =
    startSeconds !== null &&
    endSeconds !== null &&
    startSeconds >= 0 &&
    endSeconds > startSeconds &&
    endSeconds <= duration + 0.5;

  const kept = valid ? endSeconds - startSeconds : 0;

  return (
    <MediaShell
      tool={TOOL}
      accept="video/*,audio/*"
      dropTitle="Drop a video or audio file here"
      dropHint="Keep the part you want and cut off the rest."
      actionLabel={valid ? `Keep ${formatTimecode(kept)}` : "Set a valid range first"}
      options={(info) => {
        // Default the end to the file's own length once it's known.
        if (duration !== info.duration) {
          setDuration(info.duration);
          if (!end) setEnd(formatTimecode(info.duration));
        }

        return (
          <>
            <Card className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start at" hint="1:23, or 83, or 0:01:23.">
                  {(id) => (
                    <TextInput
                      id={id}
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      placeholder="0:00"
                      inputMode="numeric"
                    />
                  )}
                </Field>
                <Field label="End at" hint={`This file is ${formatTimecode(info.duration)} long.`}>
                  {(id) => (
                    <TextInput
                      id={id}
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      placeholder={formatTimecode(info.duration)}
                      inputMode="numeric"
                    />
                  )}
                </Field>
              </div>

              {/* A simple visual of what's being kept. */}
              {duration > 0 && (
                <div className="space-y-1.5">
                  <div className="relative h-3 overflow-hidden rounded-full bg-sunken">
                    {valid && (
                      <div
                        className="absolute inset-y-0 bg-accent"
                        style={{
                          left: `${(startSeconds / duration) * 100}%`,
                          width: `${((endSeconds - startSeconds) / duration) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-muted">
                    <span>0:00</span>
                    <span>{formatTimecode(duration)}</span>
                  </div>
                </div>
              )}

              {!valid && (start || end) && (
                <p className="text-sm text-danger">
                  {startSeconds === null || endSeconds === null
                    ? "Those times don't read as timecodes. Try 1:23."
                    : endSeconds <= startSeconds
                      ? "The end has to come after the start."
                      : "That's past the end of the file."}
                </p>
              )}

              {valid && (
                <p className="text-sm text-muted">
                  Keeping {formatTimecode(kept)} of {formatTimecode(duration)} —
                  from {formatTimecode(startSeconds)} to {formatTimecode(endSeconds)}.
                </p>
              )}
            </Card>

            <Notice>
              The kept section is re-encoded rather than cut at the nearest keyframe,
              so it starts and ends exactly where you asked. That takes longer than a
              rough cut, but avoids the frozen first second that quick trims produce.
            </Notice>
          </>
        );
      }}
      run={async (file, info, report, signal) => {
        if (!valid) throw new Error("Set a valid start and end first.");

        const extension = extensionOf(file.name) || "mp4";
        const isVideo = info.tracks.some((t) => t.kind === "video");
        const container = (
          isVideo
            ? ["mp4", "webm", "mkv", "mov"].includes(extension)
              ? extension
              : "mp4"
            : ["mp3", "wav", "ogg", "m4a", "flac"].includes(extension)
              ? extension
              : "m4a"
        ) as VideoContainer | AudioContainer;

        const { blob } = await convertMedia(
          file,
          { container, trim: { start: startSeconds!, end: endSeconds! } },
          report,
          signal,
        );

        return {
          files: [{ name: `${baseNameOf(file.name)} (trimmed).${container}`, blob }],
          headline: `Trimmed to ${formatTimecode(kept)}`,
          detail: `${formatBytes(file.size)} → ${formatBytes(blob.size)}`,
        };
      }}
    />
  );
}
