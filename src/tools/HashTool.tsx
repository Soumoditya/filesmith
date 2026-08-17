import { AlertTriangle, CheckCircle2, ClipboardCopy, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Field,
  Notice,
  ProgressBar,
  SegmentedControl,
  Select,
  TextInput,
  Textarea,
} from "../components/ui";
import { formatBytes } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import {
  HASH_ALGORITHMS,
  hashFile,
  hashText,
  type HashAlgorithm,
} from "../lib/textTools";

const TOOL = getTool("hash")!;

type Mode = "file" | "text";

interface Row {
  name: string;
  size: number;
  digest: string | null;
  error: string | null;
}

export default function HashTool() {
  const [mode, setMode] = useState<Mode>("file");
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>("SHA-256");
  const [rows, setRows] = useState<Row[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [textDigest, setTextDigest] = useState("");
  const [expected, setExpected] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const staged = claimFiles();
    if (staged) setFiles(staged);
  }, []);

  // Re-hash whenever the files or the algorithm change.
  useEffect(() => {
    if (files.length === 0) {
      setRows([]);
      return;
    }

    let cancelled = false;
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, size: f.size, digest: null, error: null })));

    (async () => {
      for (const [index, file] of files.entries()) {
        try {
          const digest = await hashFile(file, algorithm, (fraction) =>
            setProgress(((index + fraction) / files.length) * 100),
          );
          if (cancelled) return;
          setRows((prev) =>
            prev.map((r, i) => (i === index ? { ...r, digest } : r)),
          );
        } catch {
          if (!cancelled) {
            setRows((prev) =>
              prev.map((r, i) =>
                i === index ? { ...r, error: "Couldn't read this file." } : r,
              ),
            );
          }
        }
      }
      if (!cancelled) setBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [files, algorithm]);

  useEffect(() => {
    if (mode !== "text") return;
    if (!text) {
      setTextDigest("");
      return;
    }
    let cancelled = false;
    void hashText(text, algorithm).then((d) => {
      if (!cancelled) setTextDigest(d);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, text, algorithm]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1800);
  };

  const cleanExpected = expected.trim().toLowerCase();
  const matched =
    cleanExpected.length > 0
      ? rows.some((r) => r.digest === cleanExpected) || textDigest === cleanExpected
      : null;

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <SegmentedControl
          options={[
            { value: "file", label: "A file" },
            { value: "text", label: "Some text" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
        />

        <Field label="Which checksum?" hint={HASH_ALGORITHMS.find((a) => a.id === algorithm)?.note}>
          {(id) => (
            <Select
              id={id}
              value={algorithm}
              onChange={(e) => setAlgorithm(e.target.value as HashAlgorithm)}
            >
              {HASH_ALGORITHMS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {algorithm === "SHA-1" && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
            SHA-1 has been broken since 2017 — two different files can be made to
            share one. It’s fine for matching a checksum a project published years
            ago, and no use for proving a file hasn’t been tampered with.
          </Notice>
        )}

        {mode === "file" ? (
          files.length === 0 ? (
            <DropZone
              onFiles={setFiles}
              multiple
              title="Drop files here"
              hint="Check a download arrived intact, or compare two files."
            />
          ) : (
            <>
              {busy && <ProgressBar percent={progress} />}

              <div className="space-y-2">
                {rows.map((row) => (
                  <Card key={row.name + row.size} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                        <p className="text-xs text-muted">{formatBytes(row.size)}</p>
                        {row.digest ? (
                          <p className="mt-1.5 font-mono text-xs break-all text-ink">
                            {row.digest}
                          </p>
                        ) : row.error ? (
                          <p className="mt-1.5 text-xs text-danger">{row.error}</p>
                        ) : (
                          <p className="mt-1.5 text-xs text-muted">Working…</p>
                        )}
                      </div>
                      {row.digest && (
                        <Button
                          size="sm"
                          className="px-1.5"
                          onClick={() => copy(row.digest!)}
                          aria-label={`Copy checksum for ${row.name}`}
                        >
                          <ClipboardCopy className="size-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              <Button onClick={() => setFiles([])}>Start over</Button>
            </>
          )
        ) : (
          <>
            <Card className="p-3">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="Type or paste text…"
                aria-label="Text to hash"
              />
            </Card>
            {textDigest && (
              <Card className="p-3">
                <p className="font-mono text-xs break-all text-ink">{textDigest}</p>
                <Button size="sm" className="mt-2" onClick={() => copy(textDigest)}>
                  <ClipboardCopy className="size-4" aria-hidden />
                  {copied === textDigest ? "Copied" : "Copy"}
                </Button>
              </Card>
            )}
          </>
        )}

        <Card className="space-y-3 p-4">
          <Field
            label="Compare against a published checksum"
            hint="Paste the one from the download page to check nothing was corrupted or swapped."
          >
            {(id) => (
              <TextInput
                id={id}
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder="Paste a checksum"
                className="font-mono text-xs"
              />
            )}
          </Field>

          {matched !== null && (
            <div
              className={
                matched
                  ? "flex items-start gap-2 text-sm text-positive"
                  : "flex items-start gap-2 text-sm text-danger"
              }
            >
              {matched ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span>
                {matched
                  ? "It matches — the file is exactly what was published."
                  : "No match. Either the file differs from the published one, or the checksum uses a different algorithm than the one selected above."}
              </span>
            </div>
          )}
        </Card>
      </div>
    </ToolShell>
  );
}
