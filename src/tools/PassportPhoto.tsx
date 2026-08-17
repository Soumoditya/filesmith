import { AlertTriangle, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  Select,
  Slider,
  TextInput,
} from "../components/ui";
import { baseNameOf, formatBytes } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import {
  buildPhotoSheet,
  decodeImage,
  encodeCanvas,
  transformImage,
} from "../lib/image";
import {
  layoutPhotoSheet,
  mmToPx,
  PAPER_SIZES,
  PHOTO_SPECS,
  type PaperId,
} from "../lib/imageMath";
import { parseSize } from "../lib/sizeTarget";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";

const TOOL = getTool("passport-photo")!;

export default function PassportPhoto() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [specId, setSpecId] = useState(PHOTO_SPECS[0].id);
  const [paper, setPaper] = useState<PaperId>("4x6");
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0.5);
  const [offsetY, setOffsetY] = useState(0.45);
  const [background, setBackground] = useState("#ffffff");
  const [replaceBackground, setReplaceBackground] = useState(false);
  const [makeSheet, setMakeSheet] = useState(true);
  const [sizeLimit, setSizeLimit] = useState("");
  const job = useToolJob<OutputFile[]>();

  const spec = PHOTO_SPECS.find((s) => s.id === specId) ?? PHOTO_SPECS[0];
  const sheet = useMemo(
    () => layoutPhotoSheet(spec, PAPER_SIZES[paper]),
    [spec, paper],
  );

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const startOver = () => {
    setFile(null);
    job.reset();
  };

  const make = async () => {
    if (!file) return;

    await job.run(async (report) => {
      const bitmap = await decodeImage(file);
      const out: OutputFile[] = [];

      try {
        const targetWidth = mmToPx(spec.width, 300);
        const targetHeight = mmToPx(spec.height, 300);

        // Work out the crop from zoom and the two offsets, in source pixels.
        const aspect = spec.width / spec.height;
        const sourceAspect = bitmap.width / bitmap.height;
        let cropWidth: number;
        let cropHeight: number;

        if (sourceAspect > aspect) {
          cropHeight = bitmap.height / zoom;
          cropWidth = cropHeight * aspect;
        } else {
          cropWidth = bitmap.width / zoom;
          cropHeight = cropWidth / aspect;
        }

        const maxX = Math.max(bitmap.width - cropWidth, 0);
        const maxY = Math.max(bitmap.height - cropHeight, 0);

        const canvas = await transformImage(bitmap, {
          crop: {
            x: (maxX * offsetX) / bitmap.width,
            y: (maxY * offsetY) / bitmap.height,
            width: cropWidth / bitmap.width,
            height: cropHeight / bitmap.height,
          },
          size: { width: targetWidth, height: targetHeight },
          fit: "cover",
          background: replaceBackground ? background : "#ffffff",
        });

        report(1, makeSheet ? 3 : 2);

        // Some portals cap the photo's file size as well as its dimensions.
        const limit = parseSize(sizeLimit);
        let photo = await encodeCanvas(canvas, "jpeg", 0.94);
        if (limit && photo.size > limit) {
          const { findBestSetting } = await import("../lib/sizeTarget");
          const search = await findBestSetting(
            async (q) => {
              photo = await encodeCanvas(canvas, "jpeg", q);
              return photo.size;
            },
            limit,
            { min: 0.3, max: 0.94, maxAttempts: 6 },
          );
          photo = await encodeCanvas(canvas, "jpeg", search.setting);
        }

        out.push({
          name: `${baseNameOf(file.name)} ${spec.width}x${spec.height}mm.jpg`,
          blob: photo,
        });
        report(2, makeSheet ? 3 : 2);

        if (makeSheet && sheet.total > 0) {
          const sheetBlob = await buildPhotoSheet(photo, sheet, 300, true);
          out.push({
            name: `${baseNameOf(file.name)} print sheet (${sheet.total} copies).jpg`,
            blob: sheetBlob,
          });
          report(3, 3);
        }

        return out;
      } finally {
        bitmap.close();
      }
    });
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept="image/*,.heic,.heif"
          title="Drop a photo here"
          hint="Crops to the exact size a form asks for, and lays out a sheet to print."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell
      tool={TOOL}
      wide
      caveat={
        <>
          This gets the size and framing right, which is what most forms check. It
          can’t judge the rules a human will — a plain background, a neutral
          expression, no glare on glasses, ears visible. Check the actual
          requirements before you rely on it.
        </>
      }
    >
      <div className="space-y-5">
        <FileHeader file={file} onClear={startOver} disabled={job.busy} />

        {job.result ? (
          <ResultCard
            files={job.result}
            headline={`Photo at ${spec.width} × ${spec.height} mm${
              makeSheet && sheet.total > 0 ? `, plus a sheet of ${sheet.total}` : ""
            }`}
            detail={`${formatBytes(job.result[0].blob.size)} · 300 DPI, ready to print`}
            onStartOver={startOver}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <Card className="space-y-5 p-4">
              <Field label="What size does the form want?">
                {(id) => (
                  <Select
                    id={id}
                    value={specId}
                    onChange={(e) => setSpecId(e.target.value)}
                  >
                    {PHOTO_SPECS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} — {s.width} × {s.height} mm
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              {spec.note && <p className="-mt-2 text-xs text-muted">{spec.note}</p>}

              <Slider
                label="Zoom"
                min={100}
                max={300}
                step={5}
                value={Math.round(zoom * 100)}
                display={`${Math.round(zoom * 100)}%`}
                onChange={(e) => setZoom(Number(e.target.value) / 100)}
              />

              <Slider
                label="Move left and right"
                min={0}
                max={100}
                step={1}
                value={Math.round(offsetX * 100)}
                display={`${Math.round(offsetX * 100)}%`}
                onChange={(e) => setOffsetX(Number(e.target.value) / 100)}
              />

              <Slider
                label="Move up and down"
                min={0}
                max={100}
                step={1}
                value={Math.round(offsetY * 100)}
                display={`${Math.round(offsetY * 100)}%`}
                onChange={(e) => setOffsetY(Number(e.target.value) / 100)}
              />

              <Checkbox
                label="Make a sheet to print"
                checked={makeSheet}
                onChange={(e) => setMakeSheet(e.target.checked)}
              />

              {makeSheet && (
                <>
                  <Field label="Paper">
                    {(id) => (
                      <Select
                        id={id}
                        value={paper}
                        onChange={(e) => setPaper(e.target.value as PaperId)}
                      >
                        {Object.entries(PAPER_SIZES).map(([key, value]) => (
                          <option key={key} value={key}>
                            {value.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <p className="-mt-2 text-xs text-muted">
                    {sheet.total > 0
                      ? `${sheet.total} copies — ${sheet.columns} across, ${sheet.rows} down, with cutting guides.`
                      : "This photo size doesn't fit on that paper."}
                  </p>
                </>
              )}

              <Field
                label="File size limit"
                hint="Optional. Some portals cap the photo as well as its size."
              >
                {(id) => (
                  <TextInput
                    id={id}
                    value={sizeLimit}
                    onChange={(e) => setSizeLimit(e.target.value)}
                    placeholder="e.g. 100 KB"
                  />
                )}
              </Field>

              <Checkbox
                label="Fill gaps with a solid colour"
                checked={replaceBackground}
                onChange={(e) => setReplaceBackground(e.target.checked)}
              />
              {replaceBackground && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    aria-label="Background colour"
                    className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface p-1 touch:h-11 touch:w-14"
                  />
                  <span className="text-xs text-muted">
                    Only fills empty edges. To remove an actual background, the AI
                    tool is coming.
                  </span>
                </div>
              )}

              {job.error && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  {job.error}
                </Notice>
              )}

              {job.busy && <ProgressBar percent={job.progress ?? 0} />}

              <Button variant="primary" size="lg" busy={job.busy} onClick={make}>
                <Printer className="size-4" aria-hidden />
                Make the photo
              </Button>
            </Card>

            <div className="min-w-0 space-y-3">
              <p className="text-sm font-medium text-ink">
                Preview — {spec.width} × {spec.height} mm
              </p>

              {url && (
                <div
                  className="relative mx-auto overflow-hidden rounded border-2 border-accent bg-sunken"
                  style={{
                    aspectRatio: `${spec.width} / ${spec.height}`,
                    maxWidth: 260,
                  }}
                >
                  <img
                    src={url}
                    alt="Your photo"
                    className="absolute h-full w-full object-cover"
                    style={{
                      transform: `scale(${zoom})`,
                      objectPosition: `${offsetX * 100}% ${offsetY * 100}%`,
                    }}
                  />
                  {/* A rough guide to where a head normally sits. */}
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute left-1/2 h-[62%] w-[52%] -translate-x-1/2 rounded-[50%] border border-dashed border-white/70 top-[10%]" />
                  </div>
                </div>
              )}

              <p className="text-center text-xs leading-relaxed text-muted">
                Line the head up roughly inside the dashed oval, filling most of the
                frame with a little space above.
              </p>
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
