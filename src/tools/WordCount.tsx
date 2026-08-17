import { FileUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ToolShell } from "../components/ToolShell";
import { Button, Card, Textarea } from "../components/ui";
import { getTool } from "../lib/registry";
import { countText } from "../lib/textTools";

const TOOL = getTool("word-count")!;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function WordCount() {
  const [text, setText] = useState("");
  const [limit, setLimit] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => countText(text), [text]);
  const limitNumber = Number(limit) || 0;
  const over = limitNumber > 0 && counts.words > limitNumber;

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <Card className="p-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="Type or paste your text here…"
            aria-label="Your text"
          />
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            <FileUp className="size-4" aria-hidden />
            Open a text file
          </Button>
          <Button size="sm" disabled={!text} onClick={() => setText("")}>
            Clear
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.csv,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) setText(await file.text());
            }}
          />

          <label className="ml-auto flex items-center gap-2 text-sm text-muted">
            Word limit
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="none"
              className="h-9 w-24 rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink touch:h-11"
            />
          </label>
        </div>

        {limitNumber > 0 && (
          <Card className={over ? "border-danger/40 p-4" : "border-positive/40 p-4"}>
            <p className={over ? "text-sm text-danger" : "text-sm text-positive"}>
              {over
                ? `${(counts.words - limitNumber).toLocaleString()} words over the limit.`
                : `${(limitNumber - counts.words).toLocaleString()} words left.`}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div
                className={over ? "h-full bg-danger" : "h-full bg-positive"}
                style={{ width: `${Math.min((counts.words / limitNumber) * 100, 100)}%` }}
              />
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Words" value={counts.words.toLocaleString()} />
          <Stat label="Characters" value={counts.characters.toLocaleString()} />
          <Stat
            label="Without spaces"
            value={counts.charactersNoSpaces.toLocaleString()}
          />
          <Stat label="Sentences" value={counts.sentences.toLocaleString()} />
          <Stat label="Paragraphs" value={counts.paragraphs.toLocaleString()} />
          <Stat label="Lines" value={counts.lines.toLocaleString()} />
          <Stat
            label="Reading time"
            value={counts.readingMinutes ? `${counts.readingMinutes} min` : "—"}
            hint="Silently, to yourself"
          />
          <Stat
            label="Speaking time"
            value={counts.speakingMinutes ? `${counts.speakingMinutes} min` : "—"}
            hint="Read aloud"
          />
        </div>

        {counts.topWords.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-ink">Most used words</h2>
            <p className="mt-0.5 text-xs text-muted">
              Ignoring the very common ones like “the” and “and”.
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {counts.topWords.map((entry) => (
                <li
                  key={entry.word}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-muted"
                >
                  {entry.word}{" "}
                  <span className="font-mono text-faint">×{entry.count}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </ToolShell>
  );
}
