import { AlertTriangle, ArrowDownUp, ClipboardCopy } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Checkbox,
  Notice,
  SegmentedControl,
  Textarea,
} from "../components/ui";
import { formatBytes, saveBlob } from "../lib/files";
import { getTool } from "../lib/registry";
import { decodeBase64, encodeBase64, looksLikeBase64 } from "../lib/textTools";

const TOOL = getTool("base64")!;

type Mode = "text" | "file";

export default function Base64Tool() {
  const [mode, setMode] = useState<Mode>("text");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [urlSafe, setUrlSafe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fileResult, setFileResult] = useState<{ name: string; dataUrl: string } | null>(
    null,
  );

  useEffect(() => {
    if (mode !== "text") return;
    if (!input) {
      setOutput("");
      setError(null);
      return;
    }

    try {
      setOutput(decoding ? decodeBase64(input) : encodeBase64(input, urlSafe));
      setError(null);
    } catch {
      setOutput("");
      setError(
        decoding
          ? "That isn't valid Base64. Check for missing characters, or switch to encoding."
          : "Couldn't encode that.",
      );
    }
  }, [input, decoding, urlSafe, mode]);

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const suggestsDecoding = !decoding && looksLikeBase64(input) && input.length > 20;

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <SegmentedControl
          options={[
            { value: "text", label: "Text" },
            { value: "file", label: "A file" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
        />

        {mode === "text" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                options={[
                  { value: "encode", label: "Encode" },
                  { value: "decode", label: "Decode" },
                ]}
                value={decoding ? "decode" : "encode"}
                onChange={(v) => setDecoding(v === "decode")}
              />
              {!decoding && (
                <Checkbox
                  label="URL-safe"
                  checked={urlSafe}
                  onChange={(e) => setUrlSafe(e.target.checked)}
                />
              )}
            </div>

            <Card className="p-3">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={6}
                placeholder={decoding ? "Paste Base64 here…" : "Type or paste text here…"}
                aria-label="Input"
                className="font-mono text-xs"
              />
            </Card>

            {suggestsDecoding && (
              <Notice>
                That looks like it’s already Base64. Switch to Decode to turn it back
                into text.
              </Notice>
            )}

            {error && (
              <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                {error}
              </Notice>
            )}

            <div className="flex items-center justify-center">
              <Button size="sm" onClick={() => setDecoding((d) => !d)}>
                <ArrowDownUp className="size-4" aria-hidden />
                Swap direction
              </Button>
            </div>

            <Card className="p-3">
              <Textarea
                value={output}
                readOnly
                rows={6}
                placeholder="The result appears here."
                aria-label="Result"
                className="font-mono text-xs"
              />
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!output} onClick={copy}>
                <ClipboardCopy className="size-4" aria-hidden />
                {copied ? "Copied" : "Copy the result"}
              </Button>
              {output && (
                <span className="self-center text-xs text-muted">
                  {output.length.toLocaleString()} characters
                  {!decoding && input && (
                    <> · {Math.round((output.length / input.length - 1) * 100)}% larger</>
                  )}
                </span>
              )}
            </div>

            {!decoding && (
              <Notice>
                Base64 makes data about a third larger. It exists to move binary
                safely through things that only handle text — email, JSON, a data
                URL in a stylesheet — not to compress or hide anything. Anyone can
                decode it in a second.
              </Notice>
            )}
          </>
        ) : fileResult ? (
          <>
            <Card className="p-4">
              <p className="text-sm font-medium text-ink">{fileResult.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {formatBytes(fileResult.dataUrl.length)} as a data URL
              </p>
              <Textarea
                readOnly
                rows={8}
                value={fileResult.dataUrl}
                className="mt-3 font-mono text-[0.6875rem]"
                aria-label="Data URL"
              />
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(fileResult.dataUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                <ClipboardCopy className="size-4" aria-hidden />
                {copied ? "Copied" : "Copy the data URL"}
              </Button>
              <Button
                onClick={() =>
                  saveBlob(
                    new Blob([fileResult.dataUrl], { type: "text/plain" }),
                    `${fileResult.name}.base64.txt`,
                  )
                }
              >
                Save as a text file
              </Button>
              <Button onClick={() => setFileResult(null)}>Start over</Button>
            </div>
          </>
        ) : (
          <DropZone
            onFiles={async (files) => {
              const file = files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () =>
                setFileResult({ name: file.name, dataUrl: String(reader.result) });
              reader.readAsDataURL(file);
            }}
            title="Drop a file here"
            hint="Turns it into a data URL you can paste straight into HTML or CSS."
          />
        )}
      </div>
    </ToolShell>
  );
}
