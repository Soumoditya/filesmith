import { AlertTriangle, Eye, EyeOff, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
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
} from "../components/ui";
import { baseNameOf, formatBytes } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker } from "../lib/workers";

const TOOL = getTool("protect-pdf")!;

/** Rough strength feedback. Deliberately plain, not a scolding meter. */
function assess(password: string): { label: string; tone: string; hint: string } | null {
  if (!password) return null;
  const length = password.length;
  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));

  if (length < 8) {
    return {
      label: "Short",
      tone: "text-danger",
      hint: "Under eight characters is quick to guess. A few unrelated words works well and is easy to remember.",
    };
  }
  if (length >= 14 || variety >= 3) {
    return { label: "Strong", tone: "text-positive", hint: "" };
  }
  return {
    label: "Fair",
    tone: "text-warning",
    hint: "Longer beats more complicated. Try adding another word.",
  };
}

export default function ProtectPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(false);
  const job = useToolJob<OutputFile[]>();

  useEffect(() => {
    const staged = claimFiles();
    if (staged) setFiles(staged.filter((f) => f.name.toLowerCase().endsWith(".pdf")));
  }, []);

  const strength = assess(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= 4 && confirm === password && files.length > 0;

  const startOver = () => {
    setFiles([]);
    setPassword("");
    setConfirm("");
    job.reset();
  };

  const protectAll = async () => {
    if (!ready) return;

    await job.run(async (report) => {
      const worker = getPdfWorker();
      const out: OutputFile[] = [];

      for (const [i, file] of files.entries()) {
        const bytes = await worker.protect(file, {
          userPassword: password,
          allowPrinting,
          allowCopying,
        });
        out.push({
          name: `${baseNameOf(file.name)} (locked).pdf`,
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        });
        report(i + 1, files.length);
      }

      return out;
    });
  };

  if (files.length === 0) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(dropped) =>
            setFiles(dropped.filter((f) => f.name.toLowerCase().endsWith(".pdf")))
          }
          accept=".pdf,application/pdf"
          multiple
          title="Drop your PDFs here"
          hint="Lock them so they can't be opened without the password."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell
      tool={TOOL}
      caveat={
        <>
          There is no way to recover this password — not by us, not by anyone. If you
          forget it, the file is gone. Write it down somewhere safe first.
        </>
      }
    >
      <div className="space-y-5">
        <Card className="p-4">
          <p className="text-sm font-medium text-ink">
            {files.length} {files.length === 1 ? "file" : "files"} ·{" "}
            {formatBytes(files.reduce((s, f) => s + f.size, 0))}
          </p>
          <ul className="mt-2 space-y-0.5">
            {files.map((f) => (
              <li key={f.name} className="truncate text-xs text-muted">
                {f.name}
              </li>
            ))}
          </ul>
        </Card>

        {job.result ? (
          <ResultCard
            files={job.result}
            headline={`Locked ${job.result.length} ${job.result.length === 1 ? "file" : "files"}`}
            detail="You'll need the password to open these."
            onStartOver={startOver}
          />
        ) : (
          <>
            <Card className="space-y-5 p-5">
              <Field
                label="Password"
                hint="Three or four unrelated words make a password that's both strong and memorable."
              >
                {(id) => (
                  <div className="flex gap-2">
                    <TextInput
                      id={id}
                      type={reveal ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="copper-window-lentil"
                    />
                    <Button
                      onClick={() => setReveal((v) => !v)}
                      aria-label={reveal ? "Hide password" : "Show password"}
                    >
                      {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                )}
              </Field>

              {strength && (
                <p className="-mt-2 text-xs">
                  <span className={`font-medium ${strength.tone}`}>{strength.label}</span>
                  {strength.hint && <span className="text-muted"> — {strength.hint}</span>}
                </p>
              )}

              <Field label="Type it again">
                {(id) => (
                  <TextInput
                    id={id}
                    type={reveal ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                )}
              </Field>

              {mismatch && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  These two don’t match.
                </Notice>
              )}

              <div className="space-y-2.5 border-t border-line pt-4">
                <p className="text-sm font-medium text-ink">
                  What someone can do once it’s open
                </p>
                <Checkbox
                  label="Print it"
                  checked={allowPrinting}
                  onChange={(e) => setAllowPrinting(e.target.checked)}
                />
                <Checkbox
                  label="Select and copy the text"
                  checked={allowCopying}
                  onChange={(e) => setAllowCopying(e.target.checked)}
                />
                <p className="text-xs leading-relaxed text-muted">
                  These are requests to the PDF reader rather than locks. Well-behaved
                  readers honour them; determined software ignores them. The password
                  itself is real encryption — these permissions are not.
                </p>
              </div>
            </Card>

            {job.error && (
              <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                {job.error}
              </Notice>
            )}

            {job.busy && (
              <div className="space-y-1.5">
                <ProgressBar percent={job.progress ?? 0} />
                <p className="text-xs text-muted">Locking… {Math.round(job.progress ?? 0)}%</p>
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              busy={job.busy}
              disabled={!ready}
              onClick={protectAll}
            >
              <Lock className="size-4" aria-hidden />
              Lock {files.length > 1 ? `${files.length} files` : "the file"}
            </Button>
          </>
        )}
      </div>
    </ToolShell>
  );
}
