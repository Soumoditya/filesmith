import { useState } from "react";
import { Card, Field, Notice, Select, Slider } from "../components/ui";
import { baseNameOf, formatBytes } from "../lib/files";
import {
  convertMedia,
  formatBitrate,
  RESOLUTION_PRESETS,
  suggestedBitrate,
} from "../lib/media";
import { getTool } from "../lib/registry";
import { MediaShell } from "./media/MediaShell";

const TOOL = getTool("compress-video")!;

export default function CompressVideo() {
  const [height, setHeight] = useState(720);
  const [quality, setQuality] = useState(0.7);
  const [audioBitrate, setAudioBitrate] = useState(128_000);
  const [frameRate, setFrameRate] = useState(0);

  return (
    <MediaShell
      tool={TOOL}
      needs="video"
      accept="video/*"
      dropTitle="Drop a video here"
      dropHint="Make it small enough to send, share or upload."
      actionLabel="Compress the video"
      options={(info) => {
        const video = info.tracks.find((t) => t.kind === "video");
        const target = height || video?.height || 1080;
        const videoBitrate = Math.round(suggestedBitrate(target) * quality);
        // Rough forecast so people can judge before spending the time.
        const estimate = ((videoBitrate + audioBitrate) * info.duration) / 8;

        return (
          <>
            <Card className="space-y-5 p-5">
              <Field
                label="Resolution"
                hint="Dropping the resolution saves far more than quality alone."
              >
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

              <Slider
                label="Quality"
                min={25}
                max={110}
                step={5}
                value={Math.round(quality * 100)}
                display={`${Math.round(quality * 100)}%`}
                onChange={(e) => setQuality(Number(e.target.value) / 100)}
              />

              <Field label="Frame rate">
                {(id) => (
                  <Select
                    id={id}
                    value={frameRate}
                    onChange={(e) => setFrameRate(Number(e.target.value))}
                  >
                    <option value={0}>Keep original</option>
                    <option value={30}>30 fps</option>
                    <option value={24}>24 fps — cinematic</option>
                    <option value={15}>15 fps — screen recordings</option>
                  </Select>
                )}
              </Field>

              <Field label="Sound quality">
                {(id) => (
                  <Select
                    id={id}
                    value={audioBitrate}
                    onChange={(e) => setAudioBitrate(Number(e.target.value))}
                  >
                    <option value={192_000}>192 kbps — music</option>
                    <option value={128_000}>128 kbps — a good default</option>
                    <option value={96_000}>96 kbps — speech</option>
                    <option value={64_000}>64 kbps — smallest</option>
                  </Select>
                )}
              </Field>

              <div className="border-t border-line pt-3">
                <p className="text-sm text-muted">
                  Roughly {formatBytes(estimate)}, down from {formatBytes(info.size)} —
                  about {formatBitrate(videoBitrate)} of video.
                </p>
                <p className="mt-1 text-xs text-faint">
                  An estimate. The real size depends on how much movement is in the
                  footage: a static screen recording lands well under this, a shaky
                  handheld clip somewhat over.
                </p>
              </div>
            </Card>

            {info.duration > 300 && (
              <Notice>
                This clip is {Math.round(info.duration / 60)} minutes long, so expect
                the encode to take a while. If you only need part of it,{" "}
                <a href="/t/trim-media" className="font-medium underline underline-offset-2">
                  trim it first
                </a>{" "}
                — that's much quicker than compressing the whole thing.
              </Notice>
            )}
          </>
        );
      }}
      run={async (file, info, report, signal) => {
        const video = info.tracks.find((t) => t.kind === "video");
        const target = height || video?.height || 1080;

        const { blob } = await convertMedia(
          file,
          {
            container: "mp4",
            height: height || undefined,
            videoBitrate: Math.round(suggestedBitrate(target) * quality),
            audioBitrate,
            frameRate: frameRate || undefined,
          },
          report,
          signal,
        );

        const saved = Math.round(((file.size - blob.size) / file.size) * 100);

        return {
          files: [{ name: `${baseNameOf(file.name)} (small).mp4`, blob }],
          headline:
            saved > 0
              ? `${saved}% smaller — ${formatBytes(file.size)} down to ${formatBytes(blob.size)}`
              : "This video was already well compressed",
          detail:
            saved > 0
              ? undefined
              : "Try a lower resolution if you need it smaller still.",
        };
      }}
    />
  );
}
