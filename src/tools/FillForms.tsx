import { AlertTriangle, FileCheck2, Lock } from "lucide-react";
import { useEffect, useState } from "react";
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
  Select,
  Spinner,
  TextInput,
} from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import type { FormField } from "../lib/pdfOps";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { getPdfWorker } from "../lib/workers";

const TOOL = getTool("fill-forms")!;

/** Turns "applicant_full_name" or "Text1" into something readable. */
function humanise(name: string): string {
  const cleaned = name
    .replace(/[_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export default function FillForms() {
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [flatten, setFlatten] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const job = useToolJob<OutputFile[]>();

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    getPdfWorker()
      .listFormFields(file)
      .then((found) => {
        if (cancelled) return;
        setFields(found);
        setValues(Object.fromEntries(found.map((f) => [f.name, f.value])));
      })
      .catch(() => {
        if (!cancelled) setLoadError("This file couldn't be read as a PDF.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const startOver = () => {
    setFile(null);
    setFields(null);
    setValues({});
    job.reset();
  };

  const fill = async () => {
    if (!file) return;

    await job.run(async () => {
      const bytes = await getPdfWorker().fillForm(file, values, flatten);
      return [
        {
          name: `${baseNameOf(file.name)} (filled).pdf`,
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        },
      ];
    });
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept=".pdf,application/pdf"
          title="Drop a form here"
          hint="Fill in the boxes, then lock the answers so nobody can change them."
        />
      </ToolShell>
    );
  }

  const fillable = fields?.filter((f) => f.kind !== "unknown") ?? [];

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <FileHeader
          file={file}
          detail={fields ? `${fillable.length} fillable fields` : undefined}
          onClear={startOver}
          disabled={job.busy}
        />

        {loadError && (
          <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
            {loadError}
          </Notice>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Spinner /> Looking for form fields…
          </div>
        )}

        {fields && fillable.length === 0 && !loading && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
            This PDF has no fillable fields — it’s a flat document that only looks
            like a form. To write on it, use{" "}
            <a href="/t/edit-pdf-text" className="font-medium underline underline-offset-2">
              Edit PDF text
            </a>{" "}
            to type anywhere on the page.
          </Notice>
        )}

        {job.result ? (
          <ResultCard
            files={job.result}
            headline={`Filled ${Object.values(values).filter(Boolean).length} of ${fillable.length} fields`}
            detail={
              flatten
                ? "The answers are baked in and can't be edited."
                : "The fields stay editable."
            }
            onStartOver={startOver}
          />
        ) : (
          fillable.length > 0 && (
            <>
              <Card className="space-y-4 p-5">
                {fillable.map((field) => {
                  const label = humanise(field.name);

                  if (field.kind === "checkbox") {
                    return (
                      <Checkbox
                        key={field.name}
                        label={label}
                        checked={!!values[field.name]}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [field.name]: e.target.checked ? "on" : "",
                          }))
                        }
                      />
                    );
                  }

                  if (field.options && field.options.length > 0) {
                    return (
                      <Field key={field.name} label={label}>
                        {(id) => (
                          <Select
                            id={id}
                            value={values[field.name] ?? ""}
                            onChange={(e) =>
                              setValues((v) => ({ ...v, [field.name]: e.target.value }))
                            }
                          >
                            <option value="">— not chosen —</option>
                            {field.options!.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    );
                  }

                  return (
                    <Field key={field.name} label={label}>
                      {(id) => (
                        <TextInput
                          id={id}
                          value={values[field.name] ?? ""}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [field.name]: e.target.value }))
                          }
                        />
                      )}
                    </Field>
                  );
                })}
              </Card>

              <Card className="p-5">
                <Checkbox
                  label="Lock the answers so they can't be changed"
                  checked={flatten}
                  onChange={(e) => setFlatten(e.target.checked)}
                />
                <p className="mt-2 pl-6 text-xs leading-relaxed text-muted">
                  {flatten
                    ? "The answers become part of the page. This is usually what you want before emailing a completed form — the recipient can't alter what you wrote."
                    : "The form stays editable, so you or someone else can change the answers later."}
                </p>
              </Card>

              {job.error && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  {job.error}
                </Notice>
              )}

              <Button variant="primary" size="lg" busy={job.busy} onClick={fill}>
                {flatten ? (
                  <Lock className="size-4" aria-hidden />
                ) : (
                  <FileCheck2 className="size-4" aria-hidden />
                )}
                {flatten ? "Fill and lock" : "Fill the form"}
              </Button>
            </>
          )
        )}
      </div>
    </ToolShell>
  );
}
