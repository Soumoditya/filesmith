import { ClipboardCopy, Undo2 } from "lucide-react";
import { useState } from "react";
import { ToolShell } from "../components/ToolShell";
import { Button, Card, Textarea } from "../components/ui";
import { getTool } from "../lib/registry";
import { CASE_STYLES, convertCase, type CaseStyle } from "../lib/textTools";

const TOOL = getTool("case-converter")!;

export default function CaseConverter() {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const apply = (style: CaseStyle) => {
    setHistory((h) => [...h, text]);
    setText(convertCase(text, style));
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setText(h.at(-1)!);
      return h.slice(0, -1);
    });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <Card className="p-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder="Type or paste your text here…"
            aria-label="Your text"
          />
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-ink">Change it to</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CASE_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                disabled={!text}
                onClick={() => apply(style.id)}
                className="rounded-lg border border-line p-3 text-left transition-colors hover:border-accent hover:bg-accent-wash disabled:opacity-50 disabled:hover:border-line disabled:hover:bg-transparent"
              >
                <span className="block text-sm font-medium text-ink">{style.label}</span>
                <span className="mt-0.5 block font-mono text-xs text-muted">
                  {style.example}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!text} onClick={copy}>
            <ClipboardCopy className="size-4" aria-hidden />
            {copied ? "Copied" : "Copy the result"}
          </Button>
          <Button disabled={history.length === 0} onClick={undo}>
            <Undo2 className="size-4" aria-hidden />
            Undo
          </Button>
          <Button
            disabled={!text}
            onClick={() => {
              setHistory([]);
              setText("");
            }}
          >
            Clear
          </Button>
        </div>
      </div>
    </ToolShell>
  );
}
