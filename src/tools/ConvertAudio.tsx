import { useState } from "react";
import { Card, Field, Notice, SegmentedControl, Select } from "../components/ui";
import { baseNameOf, formatBytes } from "../lib/files";
import { convertMedia, type AudioContainer } from "../lib/media";
import { getTool } from "../lib/registry";
import { MediaShell } from "./media/MediaShell";

const TOOL = getTool("convert-audio")!;

const CONTAINERS: Array<{ value: AudioContainer; label: string; note: string }> = [
  { value: "mp3", label: "MP3", note: "Plays on everything, including old car stereos." },
  { value: "m4a", label: "M4A", note: "Better quality than MP3 at the same size. Apple's default." },
  { value: "ogg", label: "OGG", note: "Free and open. Good quality, patchier support." },
  { value: "wav", label: "WAV", note: "Uncompressed — perfect quality, enormous files." },
  { value: "flac", label: "FLAC", note: "Compressed with nothing lost. Roughly half the size of WAV." },
];

const BITRATES = [
  { value: 320_000, label: "320 kbps — near-transparent" },
  { value: 256_000, label: "256 kbps — very good" },
  { value: 192_000, label: "192 kbps — good" },
  { value: 128_000, label: "128 kbps — the old standard" },
  { value: 96_000, label: "96 kbps — speech" },
  { value: 64_000, label: "64 kbps — small, audibly rough" },
];

export default function ConvertAudio() {
  const [container, setContainer] = useState<AudioContainer>("mp3");
  const [bitrate, setBitrate] = useState(192_000);

  const lossless = container === "wav" || container === "flac";

  return (
    <MediaShell
      tool={TOOL}
      needs="audio"
      accept="audio/*,video/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus"
      dropTitle="Drop an audio file here"
      dropHint="Change its format. Video files work too — you'll get just the sound."
      actionLabel="Convert the audio"
      options={() => (
        <>
          <Card className="space-y-5 p-5">
            <Field label="Convert to">
              {() => (
                <div className="scroll-x -mx-1 px-1 pb-1">
                  <SegmentedControl
                    options={CONTAINERS.map((c) => ({ value: c.value, label: c.label }))}
                    value={container}
                    onChange={(v) => setContainer(v as AudioContainer)}
                  />
                </div>
              )}
            </Field>
            <p className="-mt-2 text-xs leading-relaxed text-muted">
              {CONTAINERS.find((c) => c.value === container)?.note}
            </p>

            {!lossless && (
              <Field
                label="Quality"
                hint="Higher means better sound and bigger files."
              >
                {(id) => (
                  <Select
                    id={id}
                    value={bitrate}
                    onChange={(e) => setBitrate(Number(e.target.value))}
                  >
                    {BITRATES.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </Card>

          {lossless ? (
            <Notice>
              {container === "wav"
                ? "WAV stores every sample uncompressed. Perfect quality, but roughly 10 MB a minute — only worth it for editing."
                : "FLAC compresses without discarding anything, so it sounds identical to the original at about half the size of WAV."}
            </Notice>
          ) : (
            <Notice>
              Converting a compressed file to another compressed format loses a
              little more each time. Going from a 128 kbps MP3 up to 320 kbps just
              makes a bigger file — the detail is already gone.
            </Notice>
          )}
        </>
      )}
      run={async (file, _info, report, signal) => {
        const { blob } = await convertMedia(
          file,
          {
            container,
            discardVideo: true,
            audioBitrate: lossless ? undefined : bitrate,
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
