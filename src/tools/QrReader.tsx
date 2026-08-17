import { AlertTriangle, Camera, ClipboardCopy, ExternalLink, StopCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DropZone } from "../components/DropZone";
import { ToolShell } from "../components/ToolShell";
import { Button, Card, Notice, SegmentedControl, Textarea } from "../components/ui";
import { decodeImage } from "../lib/image";
import { getTool } from "../lib/registry";

const TOOL = getTool("qr-reader")!;

type Mode = "upload" | "camera";

/** Recognises the structured payloads a QR code can carry. */
function describePayload(value: string): { kind: string; detail?: string } {
  if (/^https?:\/\//i.test(value)) return { kind: "A web link" };
  if (/^WIFI:/i.test(value)) {
    const ssid = value.match(/S:((?:\\.|[^;])*)/)?.[1]?.replace(/\\(.)/g, "$1");
    return { kind: "WiFi details", detail: ssid ? `Network: ${ssid}` : undefined };
  }
  if (/^BEGIN:VCARD/i.test(value)) {
    const name = value.match(/FN:(.*)/)?.[1];
    return { kind: "A contact card", detail: name };
  }
  if (/^mailto:/i.test(value)) return { kind: "An email address" };
  if (/^SMSTO:|^smsto:/i.test(value)) return { kind: "A text message" };
  if (/^upi:\/\//i.test(value)) {
    const payee = value.match(/pn=([^&]+)/)?.[1];
    return {
      kind: "A UPI payment request",
      detail: payee ? `To: ${decodeURIComponent(payee)}` : undefined,
    };
  }
  if (/^BEGIN:VEVENT/i.test(value)) return { kind: "A calendar event" };
  return { kind: "Plain text" };
}

export default function QrReader() {
  const [mode, setMode] = useState<Mode>("upload");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => stopCamera, []);

  const readImage = async (file: File) => {
    setError(null);
    try {
      const [{ default: jsQR }, bitmap] = await Promise.all([
        import("jsqr"),
        decodeImage(file),
      ]);

      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(data.data, data.width, data.height);

      if (found) setResult(found.data);
      else {
        setError(
          "No QR code found in that picture. A clearer, straighter or more closely cropped photo usually works.",
        );
      }
    } catch {
      setError("Couldn't read that file as an image.");
    }
  };

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const { default: jsQR } = await import("jsqr");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      const tick = () => {
        if (!streamRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(data.data, data.width, data.height);
          if (found) {
            setResult(found.data);
            stopCamera();
            return;
          }
        }
        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    } catch {
      setError(
        "Couldn't use the camera. Check the browser has permission, and that nothing else is using it.",
      );
      setScanning(false);
    }
  };

  const payload = result ? describePayload(result) : null;
  const isLink = result ? /^https?:\/\//i.test(result) : false;

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <SegmentedControl
          options={[
            { value: "upload", label: "Upload a picture" },
            { value: "camera", label: "Use the camera" },
          ]}
          value={mode}
          onChange={(v) => {
            stopCamera();
            setMode(v as Mode);
            setResult(null);
            setError(null);
          }}
        />

        {mode === "upload" ? (
          <DropZone
            onFiles={(files) => files[0] && readImage(files[0])}
            accept="image/*,.heic,.heif"
            title="Drop a picture of a QR code"
            hint="A screenshot or a photo both work."
          />
        ) : (
          <Card className="p-4">
            <div className="checkerboard relative mx-auto aspect-square max-w-sm overflow-hidden rounded-lg border border-line">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              {!scanning && (
                <div className="absolute inset-0 grid place-items-center bg-sunken">
                  <p className="px-6 text-center text-sm text-muted">
                    The camera preview appears here.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-3 flex justify-center">
              {scanning ? (
                <Button variant="danger" onClick={stopCamera}>
                  <StopCircle className="size-4" aria-hidden />
                  Stop
                </Button>
              ) : (
                <Button variant="primary" onClick={startCamera}>
                  <Camera className="size-4" aria-hidden />
                  Start the camera
                </Button>
              )}
            </div>

            <p className="mt-3 text-center text-xs leading-relaxed text-muted">
              The camera feed stays on your device — nothing is streamed anywhere.
            </p>
          </Card>
        )}

        {error && (
          <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
            {error}
          </Notice>
        )}

        {result && (
          <Card className="space-y-3 p-5">
            <div>
              <p className="text-sm font-medium text-ink">{payload?.kind}</p>
              {payload?.detail && (
                <p className="mt-0.5 text-xs text-muted">{payload.detail}</p>
              )}
            </div>

            <Textarea
              readOnly
              rows={Math.min(Math.ceil(result.length / 60) + 1, 10)}
              value={result}
              className="font-mono text-xs"
              aria-label="What the code contains"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(result);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                <ClipboardCopy className="size-4" aria-hidden />
                {copied ? "Copied" : "Copy"}
              </Button>
              {isLink && (
                <a
                  href={result}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:bg-sunken touch:h-11"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  Open the link
                </a>
              )}
              <Button onClick={() => setResult(null)}>Read another</Button>
            </div>

            {isLink && (
              <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
                Check the address before you open it. QR codes hide where they lead,
                and stickers placed over real ones — on parking meters and
                restaurant tables — are a common scam.
              </Notice>
            )}
          </Card>
        )}
      </div>
    </ToolShell>
  );
}
