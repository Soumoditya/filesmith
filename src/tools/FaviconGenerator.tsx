import { ClipboardCopy, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Checkbox,
  Field,
  Notice,
  ProgressBar,
  TextInput,
  Textarea,
} from "../components/ui";
import { claimFiles } from "../lib/handoff";
import { decodeImage, encodeCanvas } from "../lib/image";
import { FAVICON_SET, faviconHtml, faviconManifest } from "../lib/imageMath";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";

const TOOL = getTool("favicon-generator")!;

export default function FaviconGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("My Site");
  const [themeColour, setThemeColour] = useState("#dd5c15");
  const [padMaskable, setPadMaskable] = useState(true);
  const [copied, setCopied] = useState(false);
  const job = useToolJob<OutputFile[]>();

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const startOver = () => {
    setFile(null);
    job.reset();
  };

  const generate = async () => {
    if (!file) return;

    await job.run(async (report) => {
      const bitmap = await decodeImage(file);
      const out: OutputFile[] = [];

      try {
        for (const [index, spec] of FAVICON_SET.entries()) {
          const canvas = document.createElement("canvas");
          canvas.width = spec.size;
          canvas.height = spec.size;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Your browser wouldn't give us a canvas.");

          // Maskable icons get cropped to a circle by Android, so the mark
          // needs room around it or the edges get shaved off.
          const inset = spec.maskable && padMaskable ? spec.size * 0.14 : 0;
          const box = spec.size - inset * 2;

          if (spec.maskable) {
            ctx.fillStyle = themeColour;
            ctx.fillRect(0, 0, spec.size, spec.size);
          }

          ctx.imageSmoothingQuality = "high";
          const scale = Math.min(box / bitmap.width, box / bitmap.height);
          const width = bitmap.width * scale;
          const height = bitmap.height * scale;
          ctx.drawImage(
            bitmap,
            (spec.size - width) / 2,
            (spec.size - height) / 2,
            width,
            height,
          );

          out.push({ name: spec.name, blob: await encodeCanvas(canvas, "png") });
          report(index + 1, FAVICON_SET.length + 1);
        }

        out.push({
          name: "site.webmanifest",
          blob: new Blob([faviconManifest(siteName, themeColour)], {
            type: "application/manifest+json",
          }),
        });

        return out;
      } finally {
        bitmap.close();
      }
    });
  };

  const copyHtml = async () => {
    await navigator.clipboard.writeText(faviconHtml());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept="image/*"
          title="Drop your logo here"
          hint="A square PNG or SVG works best. You'll get every icon size a site needs."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <FileHeader file={file} onClear={startOver} disabled={job.busy} />

        {job.result ? (
          <>
            <ResultCard
              files={job.result}
              headline={`${job.result.length} files ready`}
              detail="Put them in your site's root folder."
              onStartOver={startOver}
            />

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">
                  Add this to your page’s &lt;head&gt;
                </p>
                <Button size="sm" onClick={copyHtml}>
                  <ClipboardCopy className="size-4" aria-hidden />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <Textarea
                readOnly
                rows={4}
                value={faviconHtml()}
                className="mt-3 font-mono text-xs"
                aria-label="HTML to paste"
              />
            </Card>
          </>
        ) : (
          <>
            <Card className="space-y-4 p-5">
              <div className="flex items-center gap-4">
                {url && (
                  <img
                    src={url}
                    alt="Your logo"
                    className="checkerboard size-16 rounded border border-line object-contain"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted">
                    Seven icons plus a web manifest: browser tabs, Apple home
                    screens, Android launchers and PWA installs.
                  </p>
                </div>
              </div>

              <Field label="Site name" hint="Used in the manifest and on home screens.">
                {(id) => (
                  <TextInput
                    id={id}
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                  />
                )}
              </Field>

              <Field label="Theme colour" hint="Behind maskable icons and in the browser chrome.">
                {(id) => (
                  <div className="flex items-center gap-2">
                    <input
                      id={id}
                      type="color"
                      value={themeColour}
                      onChange={(e) => setThemeColour(e.target.value)}
                      className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface p-1 touch:h-11 touch:w-14"
                    />
                    <TextInput
                      value={themeColour}
                      onChange={(e) => setThemeColour(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                )}
              </Field>

              <Checkbox
                label="Leave a safe margin on the maskable icon"
                checked={padMaskable}
                onChange={(e) => setPadMaskable(e.target.checked)}
              />
              <p className="-mt-2 pl-6 text-xs leading-relaxed text-muted">
                Android crops launcher icons to a circle or a squircle depending on
                the phone. Without a margin the edges of your logo get shaved off.
              </p>

              <Notice>
                A simple, high-contrast mark works far better than a detailed logo —
                at 16 pixels there is room for a letter or a shape, and nothing more.
              </Notice>
            </Card>

            {job.busy && <ProgressBar percent={job.progress ?? 0} />}

            <Button variant="primary" size="lg" busy={job.busy} onClick={generate}>
              <Sparkles className="size-4" aria-hidden />
              Make the icon set
            </Button>
          </>
        )}
      </div>
    </ToolShell>
  );
}
