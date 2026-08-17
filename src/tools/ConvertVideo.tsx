import { useState } from "react";
import { Card, Field, Notice, SegmentedControl, Select, Slider } from "../components/ui";
import { baseNameOf, formatBytes } from "../lib/files";
import {
  convertMedia,
  formatBitrate,
  RESOLUTION_PRESETS,
  suggestedBitrate,
  type VideoContainer,
} from "../lib/media";
import { getTool } from "../lib/registry";
import { MediaShell } from "./media/MediaShell";

const TOOL = getTool("convert-video")!;

const CONTAINERS: Array<{ value: VideoContainer; label: string; note: string }> = [
  { value: "mp4", label: "MP4", note: "Plays on everything. The safe choice." },
  { value: "webm", label: "WebM", note: "Smaller at the same quality; ideal for websites." },
  { value: "mkv", label: "MKV", note: "Flexible container, less widely supported on phones." },
  { value: "mov", label: "MOV", note: "Apple's container, for Final Cut and QuickTime." },
];

export default function ConvertVideo() {
  const [container, setContainer] = useState<VideoContainer>("mp4");
  const [height, setHeight] = useState(0);
  const [quality, setQuality] = useState(1);

  return (
    <MediaShell
      tool={TOOL}
      needs="video"
      accept="video/*,.mp4,.webm,.mkv,.mov,.m4v"
      dropTitle="Drop a video here"
      dropHint="Change its format, and its size if you want."
      actionLabel="Convert the video"
      options={(info) => {
        const video = info.tracks.find((t) => t.kind === "video");
        const target = height || video?.height || 1080;
        const bitrate = Math.round(suggestedBitrate(target) * quality);

        return (
          <>
            <Card className="space-y-5 p-5">
              <Field label="Convert to">
                {() => (
                  <SegmentedControl
                    options={CONTAINERS.map((c) => ({ value: c.value, label: c.label }))}
                    value={container}
                    onChange={(v) => setContainer(v as VideoContainer)}
                  />
                )}
              </Field>
              <p className="-mt-2 text-xs leading-relaxed text-muted">
                {CONTAINERS.find((c) => c.value === container)?.note}
              </p>

              <Field label="Resolution">
                {(id) => (
                  <Select
                    id={id}
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                  >
                    {RESOLUTION_PRESETS.filter(
                      (p) => p.height === 0 || p.height <= (video?.height ?? 4320),
                    ).map((p) => (
                      <option key={p.label} value={p.height}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <p className="-mt-2 text-xs leading-relaxed text-muted">
                Only smaller sizes are offered. Enlarging a video adds no detail — it
                just makes the existing pixels bigger.
              </p>

              <Slider
                label="Quality"
                min={40}
                max={150}
                step={10}
                value={Math.round(quality * 100)}
                display={`${Math.round(quality * 100)}%`}
                onChange={(e) => setQuality(Number(e.target.value) / 100)}
              />
              <p className="-mt-2 text-xs text-muted">
                About {formatBitrate(bitrate)} at {target}p.
              </p>
            </Card>

            <Notice>
              This uses your computer’s own video hardware, so it’s far faster than
              browser tools that ship their own encoder — but a long clip is still a
              long job. You can stop it at any point.
            </Notice>
          </>
        );
      }}
      run={async (file, info, report, signal) => {
        const video = info.tracks.find((t) => t.kind === "video");
        const target = height || video?.height || 1080;

        const { blob } = await convertMedia(
          file,
          {
            container,
            height: height || undefined,
            videoBitrate: Math.round(suggestedBitrate(target) * quality),
          },
          report,
          signal,
        );

        return {
          files: [{ name: `${baseNameOf(file.name)}.${container}`, blob }],
          headline: `Converted to ${container.toUpperCase()}`,
          detail: `${formatBytes(file.size)} → ${formatBytes(blob.size)}`,
        };
      }}
    />
  );
}
