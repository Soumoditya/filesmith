import { AlertTriangle, Download, FileDown } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Checkbox,
  Field,
  Notice,
  SegmentedControl,
  Select,
  Slider,
  TextInput,
  Textarea,
} from "../components/ui";
import { saveAllAsZip, saveBlob } from "../lib/files";
import {
  buildQrPayload,
  EMPTY_QR_FORM,
  parseBulkLine,
  type QrForm,
  type QrKind,
} from "../lib/qrPayload";
import { getTool } from "../lib/registry";

const TOOL = getTool("qr-generator")!;

type Kind = QrKind;

const KINDS: Array<{ value: Kind; label: string }> = [
  { value: "link", label: "Link" },
  { value: "text", label: "Text" },
  { value: "wifi", label: "WiFi" },
  { value: "contact", label: "Contact" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

export default function QrGenerator() {
  const [kind, setKind] = useState<Kind>("link");
  const [form, setForm] = useState<QrForm>(EMPTY_QR_FORM);
  const [size, setSize] = useState(512);
  const [margin, setMargin] = useState(2);
  const [ecc, setEcc] = useState<"L" | "M" | "Q" | "H">("M");
  const [dark, setDark] = useState("#1c1917");
  const [light, setLight] = useState("#ffffff");
  const [transparent, setTransparent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const set = <K extends keyof QrForm>(key: K, value: QrForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const payload = useMemo(() => buildQrPayload(kind, form), [kind, form]);

  const options = useMemo(
    () => ({
      errorCorrectionLevel: ecc,
      margin,
      width: size,
      color: { dark, light: transparent ? "#0000" : light },
    }),
    [ecc, margin, size, dark, light, transparent],
  );

  // Redraw the preview whenever anything changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!payload) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      setError(null);
      return;
    }

    QRCode.toCanvas(canvas, payload, options)
      .then(() => setError(null))
      .catch((err: unknown) => {
        setError(
          err instanceof Error && /too big|data too long/i.test(err.message)
            ? "That’s too much data for one QR code. Try shortening it, or lower the error correction level."
            : "Couldn’t draw a QR code for that.",
        );
      });
  }, [payload, options]);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !payload) return;
    canvas.toBlob((blob) => {
      if (blob) saveBlob(blob, "qr-code.png");
    }, "image/png");
  };

  const downloadSvg = async () => {
    if (!payload) return;
    const svg = await QRCode.toString(payload, { ...options, type: "svg" });
    saveBlob(new Blob([svg], { type: "image/svg+xml" }), "qr-code.svg");
  };

  const bulkLines = bulkText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const generateBulk = async () => {
    if (bulkLines.length === 0) return;
    setBulkBusy(true);
    try {
      const outputs: Array<{ name: string; blob: Blob }> = [];

      for (const [i, line] of bulkLines.entries()) {
        const parsed = parseBulkLine(line, i);
        if (!parsed) continue;

        const dataUrl = await QRCode.toDataURL(parsed.value, options);
        const blob = await (await fetch(dataUrl)).blob();
        outputs.push({ name: `${parsed.name}.png`, blob });
      }

      if (outputs.length > 0) await saveAllAsZip(outputs, "qr-codes.zip");
    } catch {
      setError("Something went wrong generating the batch. Check the lines for stray characters.");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <ToolShell tool={TOOL}>
      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        {/* ------------------------------------------------------- Inputs */}
        <div className="min-w-0 space-y-6">
          <div className="scroll-x -mx-1 px-1 pb-1">
            <SegmentedControl options={KINDS} value={kind} onChange={setKind} />
          </div>

          <Card className="space-y-4 p-5">
            {kind === "link" && (
              <Field label="Web address" hint="We’ll add https:// if you leave it off.">
                {(id) => (
                  <TextInput
                    id={id}
                    type="url"
                    inputMode="url"
                    placeholder="example.com/my-page"
                    value={form.link}
                    onChange={(e) => set("link", e.target.value)}
                  />
                )}
              </Field>
            )}

            {kind === "text" && (
              <Field label="Text" hint="Anything you like — a note, a code, a message.">
                {(id) => (
                  <Textarea
                    id={id}
                    rows={5}
                    placeholder="Type or paste your text"
                    value={form.text}
                    onChange={(e) => set("text", e.target.value)}
                  />
                )}
              </Field>
            )}

            {kind === "wifi" && (
              <>
                <Field label="Network name (SSID)">
                  {(id) => (
                    <TextInput
                      id={id}
                      placeholder="MyHomeWiFi"
                      value={form.wifiSsid}
                      onChange={(e) => set("wifiSsid", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Security">
                  {(id) => (
                    <Select
                      id={id}
                      value={form.wifiSecurity}
                      onChange={(e) =>
                        set("wifiSecurity", e.target.value as QrForm["wifiSecurity"])
                      }
                    >
                      <option value="WPA">WPA / WPA2 / WPA3</option>
                      <option value="WEP">WEP (older)</option>
                      <option value="nopass">No password</option>
                    </Select>
                  )}
                </Field>
                {form.wifiSecurity !== "nopass" && (
                  <Field label="Password">
                    {(id) => (
                      <TextInput
                        id={id}
                        placeholder="Your WiFi password"
                        value={form.wifiPassword}
                        onChange={(e) => set("wifiPassword", e.target.value)}
                      />
                    )}
                  </Field>
                )}
                <Checkbox
                  label="This network is hidden"
                  checked={form.wifiHidden}
                  onChange={(e) => set("wifiHidden", e.target.checked)}
                />
                <Notice>
                  Anyone who scans this joins your network. Print it for guests, but
                  don’t post it anywhere public.
                </Notice>
              </>
            )}

            {kind === "contact" && (
              <>
                <Field label="Full name">
                  {(id) => (
                    <TextInput
                      id={id}
                      placeholder="Asha Menon"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  )}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Phone">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Email">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="email"
                        placeholder="asha@example.com"
                        value={form.contactEmail}
                        onChange={(e) => set("contactEmail", e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Company">
                    {(id) => (
                      <TextInput
                        id={id}
                        placeholder="Optional"
                        value={form.org}
                        onChange={(e) => set("org", e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Website">
                    {(id) => (
                      <TextInput
                        id={id}
                        placeholder="Optional"
                        value={form.url}
                        onChange={(e) => set("url", e.target.value)}
                      />
                    )}
                  </Field>
                </div>
              </>
            )}

            {kind === "email" && (
              <>
                <Field label="Send to">
                  {(id) => (
                    <TextInput
                      id={id}
                      type="email"
                      placeholder="someone@example.com"
                      value={form.emailTo}
                      onChange={(e) => set("emailTo", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Subject">
                  {(id) => (
                    <TextInput
                      id={id}
                      placeholder="Optional"
                      value={form.emailSubject}
                      onChange={(e) => set("emailSubject", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Message">
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={3}
                      placeholder="Optional"
                      value={form.emailBody}
                      onChange={(e) => set("emailBody", e.target.value)}
                    />
                  )}
                </Field>
              </>
            )}

            {kind === "sms" && (
              <>
                <Field label="Phone number">
                  {(id) => (
                    <TextInput
                      id={id}
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={form.smsTo}
                      onChange={(e) => set("smsTo", e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Message">
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={3}
                      placeholder="Optional — pre-fills the text"
                      value={form.smsBody}
                      onChange={(e) => set("smsBody", e.target.value)}
                    />
                  )}
                </Field>
              </>
            )}
          </Card>

          {/* ---------------------------------------------------- Styling */}
          <Card className="space-y-5 p-5">
            <h2 className="text-sm font-semibold text-ink">Appearance</h2>

            <Slider
              label="Size"
              min={128}
              max={2048}
              step={64}
              value={size}
              display={`${size}px`}
              onChange={(e) => setSize(Number(e.target.value))}
            />

            <Slider
              label="Border"
              min={0}
              max={8}
              step={1}
              value={margin}
              display={margin === 0 ? "none" : `${margin}`}
              onChange={(e) => setMargin(Number(e.target.value))}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code colour">
                {(id) => (
                  <div className="flex items-center gap-2">
                    <input
                      id={id}
                      type="color"
                      value={dark}
                      onChange={(e) => setDark(e.target.value)}
                      className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface p-1"
                    />
                    <TextInput
                      value={dark}
                      onChange={(e) => setDark(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                )}
              </Field>

              <Field label="Background">
                {(id) => (
                  <div className="flex items-center gap-2">
                    <input
                      id={id}
                      type="color"
                      value={light}
                      disabled={transparent}
                      onChange={(e) => setLight(e.target.value)}
                      className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface p-1 disabled:opacity-40"
                    />
                    <TextInput
                      value={transparent ? "transparent" : light}
                      disabled={transparent}
                      onChange={(e) => setLight(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                )}
              </Field>
            </div>

            <Checkbox
              label="Transparent background"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
            />

            <Field
              label="Error correction"
              hint="Higher levels still scan when the code is scratched or partly covered, but pack in less data."
            >
              {(id) => (
                <Select
                  id={id}
                  value={ecc}
                  onChange={(e) => setEcc(e.target.value as typeof ecc)}
                >
                  <option value="L">Low — most data</option>
                  <option value="M">Medium — a good default</option>
                  <option value="Q">High</option>
                  <option value="H">Highest — best for printing on things</option>
                </Select>
              )}
            </Field>
          </Card>

          {/* ------------------------------------------------------- Bulk */}
          <Card className="p-5">
            <button
              type="button"
              onClick={() => setBulkOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">
                  Make a lot of them at once
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  One per line. Downloads as a zip.
                </span>
              </span>
              <span className="shrink-0 text-sm text-accent">
                {bulkOpen ? "Hide" : "Open"}
              </span>
            </button>

            {bulkOpen && (
              <div className="mt-4 space-y-3">
                <Textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={
                    "https://example.com/one\nhttps://example.com/two\n\nOr name them:\nteam-page, https://example.com/team"
                  }
                  className="font-mono text-xs"
                />
                <p className="text-xs leading-relaxed text-muted">
                  Put a name before a comma to control the filename. The appearance
                  settings above are used for every code.
                </p>
                <Button
                  variant="primary"
                  busy={bulkBusy}
                  disabled={bulkLines.length === 0}
                  onClick={generateBulk}
                >
                  <FileDown className="size-4" aria-hidden />
                  {bulkBusy
                    ? "Generating…"
                    : `Generate ${bulkLines.length || ""} codes`.replace("  ", " ")}
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* ------------------------------------------------------ Preview */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <div className="checkerboard grid aspect-square place-items-center overflow-hidden rounded-lg border border-line">
              <canvas
                ref={canvasRef}
                className={payload ? "h-full w-full object-contain" : "hidden"}
              />
              {!payload && (
                <p className="px-6 text-center text-sm text-muted">
                  Your QR code appears here as you type.
                </p>
              )}
            </div>

            {error && (
              <Notice tone="danger" icon={<AlertTriangle className="size-4" />} className="mt-4">
                {error}
              </Notice>
            )}

            <div className="mt-4 grid gap-2">
              <Button variant="primary" disabled={!payload || !!error} onClick={downloadPng}>
                <Download className="size-4" aria-hidden />
                Download PNG
              </Button>
              <Button disabled={!payload || !!error} onClick={downloadSvg}>
                <Download className="size-4" aria-hidden />
                Download SVG
              </Button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              SVG stays sharp at any size — use it for printing on posters, banners
              or packaging.
            </p>
          </Card>
        </div>
      </div>
    </ToolShell>
  );
}
