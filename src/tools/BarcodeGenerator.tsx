import { AlertTriangle, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Checkbox,
  Field,
  Notice,
  Select,
  Slider,
  TextInput,
  Textarea,
} from "../components/ui";
import { saveAllAsZip, saveBlob } from "../lib/files";
import { parseBulkLine } from "../lib/qrPayload";
import { getTool } from "../lib/registry";

const TOOL = getTool("barcode-generator")!;

interface Symbology {
  id: string;
  label: string;
  note: string;
  /** Returns a problem with the value, or null. */
  validate?: (value: string) => string | null;
  sample: string;
}

const digitsOnly = (length: number) => (value: string) => {
  const clean = value.replace(/\s/g, "");
  if (!/^\d+$/.test(clean)) return "This type takes digits only.";
  if (clean.length !== length && clean.length !== length - 1) {
    return `This type needs ${length - 1} or ${length} digits — you have ${clean.length}.`;
  }
  return null;
};

const SYMBOLOGIES: Symbology[] = [
  {
    id: "CODE128",
    label: "Code 128",
    note: "Takes any text. The right choice unless you've been told otherwise.",
    sample: "FILESMITH-001",
  },
  {
    id: "EAN13",
    label: "EAN-13",
    note: "Retail products worldwide. 12 digits plus a check digit.",
    validate: digitsOnly(13),
    sample: "5901234123457",
  },
  {
    id: "EAN8",
    label: "EAN-8",
    note: "Small retail packaging.",
    validate: digitsOnly(8),
    sample: "96385074",
  },
  {
    id: "UPC",
    label: "UPC-A",
    note: "Retail in the US and Canada. 11 digits plus a check digit.",
    validate: digitsOnly(12),
    sample: "036000291452",
  },
  {
    id: "CODE39",
    label: "Code 39",
    note: "Older industrial and inventory systems. Letters, digits and a few symbols.",
    sample: "ABC-123",
  },
  {
    id: "ITF14",
    label: "ITF-14",
    note: "Shipping cartons and outer packaging.",
    validate: digitsOnly(14),
    sample: "15400141288763",
  },
  {
    id: "MSI",
    label: "MSI",
    note: "Warehouse shelf labels.",
    sample: "1234567",
  },
  {
    id: "pharmacode",
    label: "Pharmacode",
    note: "Pharmaceutical packaging control.",
    sample: "1234",
  },
];

export default function BarcodeGenerator() {
  const [symbology, setSymbology] = useState("CODE128");
  const [value, setValue] = useState("FILESMITH-001");
  const [showText, setShowText] = useState(true);
  const [width, setWidth] = useState(2);
  const [height, setHeight] = useState(80);
  const [colour, setColour] = useState("#000000");
  const [background, setBackground] = useState("#ffffff");
  const [error, setError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const current = SYMBOLOGIES.find((s) => s.id === symbology)!;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const validation = current.validate?.(value) ?? null;
    if (!value.trim() || validation) {
      setError(validation);
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    void import("jsbarcode").then(({ default: JsBarcode }) => {
      try {
        JsBarcode(canvas, value, {
          format: symbology,
          displayValue: showText,
          width,
          height,
          lineColor: colour,
          background,
          margin: 10,
          font: "Inter, sans-serif",
          fontSize: 16,
        });
        setError(null);
      } catch {
        setError(
          `That value doesn't fit ${current.label}. ${current.note}`,
        );
      }
    });
  }, [symbology, value, showText, width, height, colour, background, current]);

  const download = (type: "png" | "svg") => {
    const canvas = canvasRef.current;
    if (!canvas || error) return;

    if (type === "png") {
      canvas.toBlob((blob) => blob && saveBlob(blob, `barcode-${value}.png`), "image/png");
      return;
    }

    void import("jsbarcode").then(({ default: JsBarcode }) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svg, value, {
        format: symbology,
        displayValue: showText,
        width,
        height,
        lineColor: colour,
        background,
        margin: 10,
      });
      saveBlob(
        new Blob([new XMLSerializer().serializeToString(svg)], {
          type: "image/svg+xml",
        }),
        `barcode-${value}.svg`,
      );
    });
  };

  const bulkLines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);

  const generateBulk = async () => {
    if (bulkLines.length === 0) return;
    setBulkBusy(true);

    try {
      const { default: JsBarcode } = await import("jsbarcode");
      const outputs: Array<{ name: string; blob: Blob }> = [];

      for (const [index, line] of bulkLines.entries()) {
        const parsed = parseBulkLine(line, index);
        if (!parsed) continue;
        if (current.validate?.(parsed.value)) continue;

        const canvas = document.createElement("canvas");
        try {
          JsBarcode(canvas, parsed.value, {
            format: symbology,
            displayValue: showText,
            width,
            height,
            lineColor: colour,
            background,
            margin: 10,
          });
        } catch {
          continue;
        }

        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
        if (blob) outputs.push({ name: `${parsed.name}.png`, blob });
      }

      if (outputs.length > 0) await saveAllAsZip(outputs, "barcodes.zip");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <ToolShell tool={TOOL}>
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <Card className="space-y-5 p-5">
            <Field label="Barcode type" hint={current.note}>
              {(id) => (
                <Select
                  id={id}
                  value={symbology}
                  onChange={(e) => {
                    const next = SYMBOLOGIES.find((s) => s.id === e.target.value)!;
                    setSymbology(next.id);
                    setValue(next.sample);
                  }}
                >
                  {SYMBOLOGIES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="What should it encode?">
              {(id) => (
                <TextInput
                  id={id}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={current.sample}
                  className="font-mono"
                />
              )}
            </Field>

            {error && (
              <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                {error}
              </Notice>
            )}

            <Checkbox
              label="Print the value underneath"
              checked={showText}
              onChange={(e) => setShowText(e.target.checked)}
            />

            <Slider
              label="Bar width"
              min={1}
              max={5}
              step={0.5}
              value={width}
              display={`${width}`}
              onChange={(e) => setWidth(Number(e.target.value))}
            />

            <Slider
              label="Height"
              min={30}
              max={200}
              step={10}
              value={height}
              display={`${height} px`}
              onChange={(e) => setHeight(Number(e.target.value))}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bar colour">
                {(id) => (
                  <input
                    id={id}
                    type="color"
                    value={colour}
                    onChange={(e) => setColour(e.target.value)}
                    className="h-10 w-full cursor-pointer rounded-lg border border-line-strong bg-surface p-1 touch:h-11"
                  />
                )}
              </Field>
              <Field label="Background">
                {(id) => (
                  <input
                    id={id}
                    type="color"
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    className="h-10 w-full cursor-pointer rounded-lg border border-line-strong bg-surface p-1 touch:h-11"
                  />
                )}
              </Field>
            </div>

            <Notice>
              Scanners need strong contrast and a clear margin either side. Dark bars
              on a white background reads reliably; anything else is a gamble.
            </Notice>
          </Card>

          <Card className="p-5">
            <button
              type="button"
              onClick={() => setBulkOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-3 py-1 text-left touch:min-h-11"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">
                  Make a lot at once
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  One value per line. Downloads as a zip.
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
                  placeholder={"SKU-001\nSKU-002\n\nOr name them:\nblue shirt, SKU-003"}
                  className="font-mono text-xs"
                />
                <Button
                  variant="primary"
                  busy={bulkBusy}
                  disabled={bulkLines.length === 0}
                  onClick={generateBulk}
                >
                  Generate {bulkLines.length || ""} barcodes
                </Button>
              </div>
            )}
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <div className="grid min-h-40 place-items-center overflow-hidden rounded-lg border border-line bg-white p-3">
              <canvas ref={canvasRef} className="max-w-full" />
            </div>

            <div className="mt-4 grid gap-2">
              <Button variant="primary" disabled={!!error} onClick={() => download("png")}>
                <Download className="size-4" aria-hidden />
                Download PNG
              </Button>
              <Button disabled={!!error} onClick={() => download("svg")}>
                <Download className="size-4" aria-hidden />
                Download SVG
              </Button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              SVG stays crisp at any size — use it for anything being printed.
            </p>
          </Card>
        </div>
      </div>
    </ToolShell>
  );
}
