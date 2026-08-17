import { VolumeX } from "lucide-react";
import { Card, Notice } from "../components/ui";
import { baseNameOf, extensionOf, formatBytes } from "../lib/files";
import { convertMedia, formatTimecode, type VideoContainer } from "../lib/media";
import { getTool } from "../lib/registry";
import { MediaShell } from "./media/MediaShell";

const TOOL = getTool("mute-video")!;

export default function MuteVideo() {
  return (
    <MediaShell
      tool={TOOL}
      needs="video"
      accept="video/*"
      dropTitle="Drop a video here"
      dropHint="Removes the sound completely and keeps the picture."
      actionLabel="Remove the sound"
      options={(info) => {
        const audio = info.tracks.find((t) => t.kind === "audio");

        return (
          <>
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <VolumeX className="mt-0.5 size-5 shrink-0 text-faint" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-ink">
                    {audio
                      ? "The sound will be stripped out entirely"
                      : "This video already has no sound"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {audio
                      ? "This removes the audio track rather than turning the volume down, so nothing can be recovered from the file afterwards — which is the point when there's background conversation you'd rather not share."
                      : "Nothing to remove. You can still save a copy if you want one."}
                  </p>
                </div>
              </div>
            </Card>

            <Notice>
              {formatTimecode(info.duration)} of video. Dropping the audio also makes
              the file a little smaller.
            </Notice>
          </>
        );
      }}
      run={async (file, _info, report, signal) => {
        const extension = extensionOf(file.name);
        const container = (
          ["mp4", "webm", "mkv", "mov"].includes(extension) ? extension : "mp4"
        ) as VideoContainer;

        const { blob } = await convertMedia(
          file,
          { container, discardAudio: true },
          report,
          signal,
        );

        return {
          files: [{ name: `${baseNameOf(file.name)} (silent).${container}`, blob }],
          headline: "Sound removed",
          detail: `${formatBytes(file.size)} → ${formatBytes(blob.size)}`,
        };
      }}
    />
  );
}
