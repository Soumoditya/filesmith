import { useState } from "react";
import { Card, Field, Notice, Slider, TextInput } from "../components/ui";
import { baseNameOf, formatBytes } from "../lib/files";
import { formatTimecode, parseTimecode, videoToGif } from "../lib/media";
import { getTool } from "../lib/registry";
import { MediaShell } from "./media/MediaShell";

const TOOL = getTool("video-to-gif")!;

/** Beyond this a GIF stops being shareable, whatever the settings. */
const SENSIBLE_SECONDS = 15;

export default function VideoToGif() {
  const [start, setStart] = useState("0:00");
  const [length, setLength] = useState(5);
  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(480);
  const [colours, setColours] = useState(128);

  const startSeconds = parseTimecode(start) ?? 0;

  return (
    <MediaShell
      tool={TOOL}
      needs="video"
      accept="video/*"
      dropTitle="Drop a video here"
      dropHint="Turn a few seconds into an animated GIF."
      actionLabel="Make the GIF"
      options={(info) => {
        const end = Math.min(startSeconds + length, info.duration);
        const frames = Math.max(Math.round((end - startSeconds) * fps), 1);
        // GIF stores each frame as its own palettised image, so size scales
        // with frames times pixels. This is rough but the right order.
        const estimate = frames * width * (width * 0.5625) * 0.22;

        return (
          <>
            <Card className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start at" hint={`Video is ${formatTimecode(info.duration)} long.`}>
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
                <Field label="How long?">
                  {() => (
                    <Slider
                      label=""
                      min={1}
                      max={SENSIBLE_SECONDS}
                      step={1}
                      value={length}
                      display={`${length}s`}
                      onChange={(e) => setLength(Number(e.target.value))}
                    />
                  )}
                </Field>
              </div>

              <Slider
                label="Smoothness"
                min={5}
                max={24}
                step={1}
                value={fps}
                display={`${fps} frames a second`}
                onChange={(e) => setFps(Number(e.target.value))}
              />

              <Slider
                label="Width"
                min={160}
                max={800}
                step={20}
                value={width}
                display={`${width} px`}
                onChange={(e) => setWidth(Number(e.target.value))}
              />

              <Slider
                label="Colours"
                min={16}
                max={256}
                step={16}
                value={colours}
                display={`${colours}`}
                onChange={(e) => setColours(Number(e.target.value))}
              />
              <p className="-mt-2 text-xs leading-relaxed text-muted">
                A GIF can hold 256 colours at most. Dropping to 64 or 32 shrinks the
                file a lot and is barely noticeable on screen recordings and
                cartoons, though photographs start to band.
              </p>

              <div className="border-t border-line pt-3">
                <p className="text-sm text-muted">
                  {frames} frames · roughly {formatBytes(estimate)}
                </p>
                {estimate > 12 * 1024 * 1024 && (
                  <p className="mt-1 text-xs text-warning">
                    That’s very large for a GIF. Fewer frames a second, a smaller
                    width or fewer colours will all help.
                  </p>
                )}
              </div>
            </Card>

            <Notice>
              GIF is an old format that stores every frame as a separate image, so it
              produces files many times larger than the video it came from. If you
              only need it to loop silently on a website, a muted WebM or MP4 is
              smaller and sharper — but nothing beats GIF for pasting into a chat.
            </Notice>
          </>
        );
      }}
      run={async (file, info, report) => {
        const end = Math.min(startSeconds + length, info.duration);

        const blob = await videoToGif(
          file,
          { start: startSeconds, end, fps, width, colours },
          report,
        );

        return {
          files: [{ name: `${baseNameOf(file.name)}.gif`, blob }],
          headline: `${Math.round(end - startSeconds)} second GIF`,
          detail: `${formatBytes(blob.size)} · ${width}px wide at ${fps} fps`,
        };
      }}
    />
  );
}
