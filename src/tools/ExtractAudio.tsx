import { useState } from "react";
import { Card, Field, Notice, SegmentedControl, Select } from "../components/ui";
import { baseNameOf, formatBytes } from "../lib/files";
import { convertMedia, formatTimecode, type AudioContainer } from "../lib/media";
import { getTool } from "../lib/registry";
import { MediaShell } from "./media/MediaShell";

const TOOL = getTool("extract-audio")!;

export default function ExtractAudio() {
  const [container, setContainer] = useState<AudioContainer>("mp3");
  const [bitrate, setBitrate] = useState(192_000);

  return (
    <MediaShell
      tool={TOOL}
      needs="audio"
      accept="video/*,.mp4,.webm,.mkv,.mov,.m4v"
      dropTitle="Drop a video here"
      dropHint="Keeps the sound and throws away the picture."
      actionLabel="Get the audio"
      options={(info) => {
        const audio = info.tracks.find((t) => t.kind === "audio");

        return (
          <>
            <Card className="space-y-5 p-5">
              <Field label="Save the sound as">
                {() => (
                  <SegmentedControl
                    options={[
                      { value: "mp3", label: "MP3" },
                      { value: "m4a", label: "M4A" },
                      { value: "wav", label: "WAV" },
                      { value: "flac", label: "FLAC" },
                    ]}
                    value={container}
                    onChange={(v) => setContainer(v as AudioContainer)}
                  />
                )}
              </Field>

              {container !== "wav" && container !== "flac" && (
                <Field label="Quality">
                  {(id) => (
                    <Select
                      id={id}
                      value={bitrate}
                      onChange={(e) => setBitrate(Number(e.target.value))}
                    >
                      <option value={320_000}>320 kbps — best</option>
                      <option value={256_000}>256 kbps</option>
                      <option value={192_000}>192 kbps — a good default</option>
                      <option value={128_000}>128 kbps</option>
                      <option value={96_000}>96 kbps — speech and podcasts</option>
                    </Select>
                  )}
                </Field>
              )}

              {audio && (
                <p className="text-sm text-muted">
                  {formatTimecode(info.duration)} of audio ·{" "}
                  {audio.channels === 1 ? "mono" : `${audio.channels} channels`} ·{" "}
                  {audio.sampleRate?.toLocaleString()} Hz
                </p>
              )}
            </Card>

            <Notice>
              Only works on files you already have. Nothing here downloads from
              YouTube or any other site.
            </Notice>
          </>
        );
      }}
      run={async (file, info, report, signal) => {
        const { blob } = await convertMedia(
          file,
          {
            container,
            discardVideo: true,
            audioBitrate:
              container === "wav" || container === "flac" ? undefined : bitrate,
          },
          report,
          signal,
        );

        return {
          files: [{ name: `${baseNameOf(file.name)}.${container}`, blob }],
          headline: `${formatTimecode(info.duration)} of audio`,
          detail: `${formatBytes(file.size)} video → ${formatBytes(blob.size)} audio`,
        };
      }}
    />
  );
}
