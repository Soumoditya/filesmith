import { AlertTriangle, Eye, EyeOff, LockOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import { Button, Card, Field, Notice, TextInput } from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker } from "../lib/workers";

const TOOL = getTool("unlock-pdf")!;

export default function UnlockPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [wrong, setWrong] = useState(false);
  const job = useToolJob<OutputFile[]>();

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  const startOver = () => {
    setFile(null);
    setPassword("");
    setWrong(false);
    job.reset();
  };

  const unlock = async () => {
    if (!file) return;
    setWrong(false);

    try {
      await job.run(async () => {
        const worker = getPdfWorker();
        const bytes = await worker.unlock(file, password);
        return [
          {
            name: `${baseNameOf(file.name)} (unlocked).pdf`,
            blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
          },
        ];
      });
    } finally {
      // A rejected password is by far the likeliest failure, so it gets its
      // own message rather than the generic one.
      setWrong(true);
    }
  };

  const passwordProbablyWrong =
    wrong && !!job.error && /password|encrypt/i.test(job.error);

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept=".pdf,application/pdf"
          title="Drop a locked PDF here"
          hint="Takes the password off a file you can already open."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell
      tool={TOOL}
      caveat={
        <>
          This removes a password you already know — it can’t break into a file you
          don’t have the password for, and nothing here tries to guess one.
        </>
      }
    >
      <div className="space-y-5">
        <FileHeader file={file} onClear={startOver} disabled={job.busy} />

        {job.result ? (
          <ResultCard
            files={job.result}
            headline="Password removed"
            detail="This copy opens without a password."
            onStartOver={startOver}
          />
        ) : (
          <>
            <Card className="space-y-4 p-5">
              <Field
                label="The password"
                hint="Leave this empty if the file opens without one but still refuses to be edited."
              >
                {(id) => (
                  <div className="flex gap-2">
                    <TextInput
                      id={id}
                      type={reveal ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setWrong(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void unlock();
                      }}
                      autoComplete="off"
                      placeholder="Enter the password"
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
            </Card>

            {passwordProbablyWrong ? (
              <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                That password didn’t open the file. Check for stray spaces, and remember
                capital letters matter.
              </Notice>
            ) : (
              job.error && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  {job.error}
                </Notice>
              )
            )}

            <Button variant="primary" size="lg" busy={job.busy} onClick={unlock}>
              <LockOpen className="size-4" aria-hidden />
              Remove the password
            </Button>
          </>
        )}
      </div>
    </ToolShell>
  );
}
