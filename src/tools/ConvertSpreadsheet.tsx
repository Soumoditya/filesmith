import { AlertTriangle, Table2 } from "lucide-react";
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
  ProgressBar,
  SegmentedControl,
  Select,
  Spinner,
} from "../components/ui";
import { baseNameOf, extensionOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";

const TOOL = getTool("convert-spreadsheet")!;

type Target = "csv" | "json" | "xlsx" | "tsv";

interface SheetData {
  name: string;
  rows: unknown[][];
}

/** Reads any supported spreadsheet into plain rows. */
async function readSheets(file: File): Promise<SheetData[]> {
  const extension = extensionOf(file.name);

  if (extension === "csv" || extension === "tsv" || extension === "txt") {
    const { default: Papa } = await import("papaparse");
    const parsed = Papa.parse<string[]>(await file.text(), {
      delimiter: extension === "tsv" ? "\t" : "",
      skipEmptyLines: "greedy",
    });
    return [{ name: baseNameOf(file.name), rows: parsed.data }];
  }

  if (extension === "json") {
    const parsed = JSON.parse(await file.text());
    const list: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed];
    if (list.length === 0) return [{ name: "Sheet1", rows: [] }];

    // Union of every object's keys, so a sparse record doesn't drop columns.
    const headers = [...new Set(list.flatMap((row) => Object.keys(row ?? {})))];
    return [
      {
        name: baseNameOf(file.name),
        rows: [headers, ...list.map((row) => headers.map((h) => row?.[h] ?? ""))],
      },
    ];
  }

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  return workbook.worksheets.map((sheet) => {
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as unknown[];
      // ExcelJS pads index 0; drop it so columns line up.
      rows.push(values.slice(1).map((cell) => cellToPlain(cell)));
    });
    return { name: sheet.name, rows };
  });
}

/** Flattens a rich ExcelJS cell into something a CSV can hold. */
function cellToPlain(cell: unknown): string | number | boolean | null {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") {
    const rich = cell as {
      text?: string;
      result?: unknown;
      richText?: Array<{ text: string }>;
      hyperlink?: string;
    };
    if (rich.richText) return rich.richText.map((r) => r.text).join("");
    if (rich.text !== undefined) return rich.text;
    if (rich.result !== undefined) return String(rich.result);
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
    return String(cell);
  }
  return cell as string | number | boolean;
}

export default function ConvertSpreadsheet() {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>("csv");
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(true);
  const [allSheets, setAllSheets] = useState(false);
  const job = useToolJob<OutputFile[]>();

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  useEffect(() => {
    if (!file) {
      setSheets(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    readSheets(file)
      .then((result) => {
        if (!cancelled) {
          setSheets(result);
          setSheetIndex(0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(
            "Couldn't read that file. Excel, CSV, TSV and JSON are supported — old .xls files need saving as .xlsx first.",
          );
        }
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
    setSheets(null);
    job.reset();
  };

  const convert = async () => {
    if (!sheets) return;
    const chosen = allSheets ? sheets : [sheets[sheetIndex]];
    const stem = baseNameOf(file!.name);

    await job.run(async (report) => {
      const out: OutputFile[] = [];

      for (const [index, sheet] of chosen.entries()) {
        const suffix = chosen.length > 1 ? ` - ${sheet.name}` : "";

        if (target === "csv" || target === "tsv") {
          const { default: Papa } = await import("papaparse");
          const text = Papa.unparse(sheet.rows, {
            delimiter: target === "tsv" ? "\t" : ",",
          });
          out.push({
            name: `${stem}${suffix}.${target}`,
            blob: new Blob([text], { type: "text/csv;charset=utf-8" }),
          });
        } else if (target === "json") {
          const [head, ...body] = sheet.rows;
          const data = headerRow
            ? body.map((row) =>
                Object.fromEntries(
                  (head ?? []).map((key, i) => [String(key || `column${i + 1}`), row[i] ?? ""]),
                ),
              )
            : sheet.rows;
          out.push({
            name: `${stem}${suffix}.json`,
            blob: new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            }),
          });
        } else {
          const ExcelJS = await import("exceljs");
          const workbook = new ExcelJS.Workbook();
          workbook.creator = "Filesmith";
          for (const source of chosen) {
            const worksheet = workbook.addWorksheet(source.name.slice(0, 31) || "Sheet1");
            for (const row of source.rows) worksheet.addRow(row as never[]);
            if (headerRow && source.rows.length > 0) {
              worksheet.getRow(1).font = { bold: true };
            }
          }
          const buffer = await workbook.xlsx.writeBuffer();
          out.push({
            name: `${stem}.xlsx`,
            blob: new Blob([buffer], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }),
          });
          report(chosen.length, chosen.length);
          return out;
        }

        report(index + 1, chosen.length);
      }

      return out;
    });
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept=".xlsx,.xlsm,.csv,.tsv,.json,.txt"
          title="Drop a spreadsheet here"
          hint="Excel, CSV, TSV or JSON — convert between any of them."
        />
      </ToolShell>
    );
  }

  const active = sheets?.[sheetIndex];
  const preview = active?.rows.slice(0, 8) ?? [];

  return (
    <ToolShell tool={TOOL}>
      <div className="space-y-5">
        <FileHeader
          file={file}
          detail={sheets ? `${sheets.length} sheet${sheets.length === 1 ? "" : "s"}` : undefined}
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
            <Spinner /> Reading the spreadsheet…
          </div>
        )}

        {job.result ? (
          <ResultCard
            files={job.result}
            headline={`Converted to ${target.toUpperCase()}`}
            onStartOver={startOver}
          />
        ) : (
          sheets && (
            <>
              {sheets.length > 1 && (
                <Field label="Which sheet?">
                  {(id) => (
                    <Select
                      id={id}
                      value={sheetIndex}
                      disabled={allSheets}
                      onChange={(e) => setSheetIndex(Number(e.target.value))}
                    >
                      {sheets.map((sheet, i) => (
                        <option key={sheet.name} value={i}>
                          {sheet.name} ({sheet.rows.length} rows)
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}

              {preview.length > 0 && (
                <Card className="p-0">
                  <div className="scroll-x">
                    <table className="w-full text-xs">
                      <tbody>
                        {preview.map((row, r) => (
                          <tr key={r} className="border-b border-line last:border-0">
                            {(row as unknown[]).slice(0, 10).map((cell, c) => (
                              <td
                                key={c}
                                className={
                                  r === 0 && headerRow
                                    ? "max-w-40 truncate px-3 py-1.5 font-medium text-ink"
                                    : "max-w-40 truncate px-3 py-1.5 text-muted"
                                }
                              >
                                {String(cell ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t border-line px-3 py-2 text-xs text-muted">
                    Showing the first {preview.length} of {active?.rows.length ?? 0} rows.
                  </p>
                </Card>
              )}

              <Card className="space-y-4 p-5">
                <Field label="Convert to">
                  {() => (
                    <SegmentedControl
                      options={[
                        { value: "csv", label: "CSV" },
                        { value: "tsv", label: "TSV" },
                        { value: "json", label: "JSON" },
                        { value: "xlsx", label: "Excel" },
                      ]}
                      value={target}
                      onChange={(v) => setTarget(v as Target)}
                    />
                  )}
                </Field>

                <Checkbox
                  label="The first row is column headings"
                  checked={headerRow}
                  onChange={(e) => setHeaderRow(e.target.checked)}
                />

                {sheets.length > 1 && (
                  <Checkbox
                    label={
                      target === "xlsx"
                        ? "Include every sheet in the workbook"
                        : "Convert every sheet to its own file"
                    }
                    checked={allSheets}
                    onChange={(e) => setAllSheets(e.target.checked)}
                  />
                )}

                {target === "csv" && (
                  <Notice>
                    CSV holds one grid of plain values — formulas, formatting,
                    multiple sheets and charts are all left behind. That’s the format
                    doing its job, not a fault, but it’s worth knowing before you
                    replace the original.
                  </Notice>
                )}
              </Card>

              {job.error && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  {job.error}
                </Notice>
              )}

              {job.busy && <ProgressBar percent={job.progress ?? 0} />}

              <Button variant="primary" size="lg" busy={job.busy} onClick={convert}>
                <Table2 className="size-4" aria-hidden />
                Convert to {target.toUpperCase()}
              </Button>
            </>
          )
        )}
      </div>
    </ToolShell>
  );
}
