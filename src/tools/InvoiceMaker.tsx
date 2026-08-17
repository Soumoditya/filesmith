import {
  AlertTriangle,
  Download,
  FolderOpen,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DocPreview, useDocumentPreview } from "../components/DocPreview";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Checkbox,
  Field,
  Notice,
  SegmentedControl,
  Select,
  TextInput,
  Textarea,
} from "../components/ui";
import {
  clearDraft,
  loadDraft,
  readSavedFile,
  toSavedFile,
  useAutosave,
  useRelativeTime,
} from "../lib/draft";
import { saveBlob } from "../lib/files";
import {
  CURRENCIES,
  DOCUMENT_LABELS,
  emptyItem,
  formatMoney,
  GST_RATES,
  INDIAN_STATES,
  invoiceTotals,
  sampleInvoice,
  validateGstin,
  type DocumentKind,
  type InvoiceDoc,
  type LineItem,
  type Party,
  type TaxMode,
} from "../lib/invoice/model";
import { buildInvoiceDocument } from "../lib/invoice/template";
import { getTool } from "../lib/registry";

const DRAFT_KEY = "invoice";
const TOOL = getTool("invoice-maker")!;

type Tab = "details" | "items" | "extras";

export default function InvoiceMaker() {
  const [doc, setDoc] = useState<InvoiceDoc>(
    () => loadDraft<InvoiceDoc>(DRAFT_KEY) ?? sampleInvoice(),
  );
  const [tab, setTab] = useState<Tab>("details");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const openInput = useRef<HTMLInputElement>(null);

  const draft = useAutosave(DRAFT_KEY, doc);
  const savedAgo = useRelativeTime(draft.savedAt);

  const spec = useMemo(() => buildInvoiceDocument(doc), [doc]);
  const { pages, result, building, error } = useDocumentPreview(spec, 600);
  const totals = useMemo(() => invoiceTotals(doc), [doc]);

  const patch = (changes: Partial<InvoiceDoc>) => setDoc((d) => ({ ...d, ...changes }));
  const patchParty = (side: "from" | "to", changes: Partial<Party>) =>
    setDoc((d) => ({ ...d, [side]: { ...d[side], ...changes } }));
  const patchItem = (id: string, changes: Partial<LineItem>) =>
    setDoc((d) => ({
      ...d,
      items: d.items.map((i) => (i === undefined ? i : i.id === id ? { ...i, ...changes } : i)),
    }));

  const cash = (v: number) => formatMoney(v, doc.currencySymbol, doc.currency);
  const isIndian = doc.currency === "INR";
  const gstinError = validateGstin(doc.from.gstin) ?? validateGstin(doc.to.gstin);

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { renderDocument } = await import("../lib/doc/render");
      const rendered = await renderDocument(spec);
      saveBlob(
        new Blob([rendered.bytes as BlobPart], { type: "application/pdf" }),
        `${DOCUMENT_LABELS[doc.kind].noun} ${doc.number || ""}`.trim() + ".pdf",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <ToolShell tool={TOOL} wide>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-5">
          <div className="scroll-x -mx-1 px-1 pb-1">
            <SegmentedControl
              options={[
                { value: "details", label: "Details" },
                { value: "items", label: `Items (${doc.items.length})` },
                { value: "extras", label: "Payment & notes" },
              ]}
              value={tab}
              onChange={(v) => setTab(v as Tab)}
            />
          </div>

          {loadError && (
            <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
              {loadError}
            </Notice>
          )}

          {tab === "details" && (
            <>
              <Card className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Document type">
                    {(id) => (
                      <Select
                        id={id}
                        value={doc.kind}
                        onChange={(e) => patch({ kind: e.target.value as DocumentKind })}
                      >
                        <option value="invoice">Tax invoice</option>
                        <option value="quotation">Quotation</option>
                        <option value="estimate">Estimate</option>
                        <option value="receipt">Receipt</option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Number">
                    {(id) => (
                      <TextInput
                        id={id}
                        value={doc.number}
                        onChange={(e) => patch({ number: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Date">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="date"
                        value={doc.date}
                        onChange={(e) => patch({ date: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Due date" hint="Optional.">
                    {(id) => (
                      <TextInput
                        id={id}
                        type="date"
                        value={doc.dueDate}
                        onChange={(e) => patch({ dueDate: e.target.value })}
                      />
                    )}
                  </Field>
                </div>

                <Field label="Currency">
                  {(id) => (
                    <Select
                      id={id}
                      value={doc.currency}
                      onChange={(e) => {
                        const chosen = CURRENCIES.find((c) => c.code === e.target.value)!;
                        patch({ currency: chosen.code, currencySymbol: chosen.symbol });
                      }}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} {c.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </Card>

              {(["from", "to"] as const).map((side) => (
                <Card key={side} className="space-y-3 p-4">
                  <h2 className="text-sm font-semibold text-ink">
                    {side === "from" ? "Your details" : "Customer"}
                  </h2>
                  <Field label="Name">
                    {(id) => (
                      <TextInput
                        id={id}
                        value={doc[side].name}
                        onChange={(e) => patchParty(side, { name: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Address">
                    {(id) => (
                      <Textarea
                        id={id}
                        rows={2}
                        value={doc[side].address}
                        onChange={(e) => patchParty(side, { address: e.target.value })}
                      />
                    )}
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Email">
                      {(id) => (
                        <TextInput
                          id={id}
                          type="email"
                          value={doc[side].email}
                          onChange={(e) => patchParty(side, { email: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Phone">
                      {(id) => (
                        <TextInput
                          id={id}
                          type="tel"
                          value={doc[side].phone}
                          onChange={(e) => patchParty(side, { phone: e.target.value })}
                        />
                      )}
                    </Field>
                  </div>

                  {isIndian && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="GSTIN" hint="Optional if not registered.">
                        {(id) => (
                          <TextInput
                            id={id}
                            value={doc[side].gstin}
                            onChange={(e) =>
                              patchParty(side, { gstin: e.target.value.toUpperCase() })
                            }
                            placeholder="29ABCDE1234F1Z5"
                            maxLength={15}
                          />
                        )}
                      </Field>
                      <Field label="State">
                        {(id) => (
                          <Select
                            id={id}
                            value={doc[side].state}
                            onChange={(e) => patchParty(side, { state: e.target.value })}
                          >
                            <option value="">— choose —</option>
                            {INDIAN_STATES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    </div>
                  )}
                </Card>
              ))}

              {gstinError && (
                <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
                  {gstinError}
                </Notice>
              )}
            </>
          )}

          {tab === "items" && (
            <>
              <Card className="space-y-4 p-4">
                <Field label="Tax">
                  {() => (
                    <SegmentedControl
                      options={[
                        { value: "gst", label: "India GST" },
                        { value: "single", label: "One rate" },
                        { value: "none", label: "No tax" },
                      ]}
                      value={doc.taxMode}
                      onChange={(v) => patch({ taxMode: v as TaxMode })}
                    />
                  )}
                </Field>

                {doc.taxMode === "gst" && (
                  <>
                    <Field
                      label="Place of supply"
                      hint="Decides whether this is CGST + SGST or IGST."
                    >
                      {(id) => (
                        <Select
                          id={id}
                          value={doc.placeOfSupply}
                          onChange={(e) => patch({ placeOfSupply: e.target.value })}
                        >
                          <option value="">— same as customer —</option>
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Notice>
                      {totals.intraState
                        ? "Within your own state, so the tax splits into CGST and SGST at half each."
                        : "A different state, so the whole tax is charged as IGST."}{" "}
                      The total is the same either way — but the boxes have to be
                      right, or your customer can’t claim it back.
                    </Notice>
                  </>
                )}

                {doc.taxMode === "single" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Tax name">
                      {(id) => (
                        <TextInput
                          id={id}
                          value={doc.taxLabel}
                          onChange={(e) => patch({ taxLabel: e.target.value })}
                          placeholder="VAT"
                        />
                      )}
                    </Field>
                    <Field label="Rate %">
                      {(id) => (
                        <TextInput
                          id={id}
                          type="number"
                          value={doc.flatTaxRate}
                          onChange={(e) => patch({ flatTaxRate: Number(e.target.value) || 0 })}
                        />
                      )}
                    </Field>
                  </div>
                )}
              </Card>

              {doc.items.map((item, index) => (
                <Card key={item.id} className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted">Item {index + 1}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-1.5"
                      onClick={() =>
                        setDoc((d) => ({
                          ...d,
                          items: d.items.filter((i) => i.id !== item.id),
                        }))
                      }
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <Field label="Description">
                    {(id) => (
                      <TextInput
                        id={id}
                        value={item.description}
                        onChange={(e) => patchItem(item.id, { description: e.target.value })}
                      />
                    )}
                  </Field>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Quantity">
                      {(id) => (
                        <TextInput
                          id={id}
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            patchItem(item.id, { quantity: Number(e.target.value) || 0 })
                          }
                        />
                      )}
                    </Field>
                    <Field label="Unit">
                      {(id) => (
                        <TextInput
                          id={id}
                          value={item.unit}
                          onChange={(e) => patchItem(item.id, { unit: e.target.value })}
                          placeholder="hrs"
                        />
                      )}
                    </Field>
                    <Field label="Rate">
                      {(id) => (
                        <TextInput
                          id={id}
                          type="number"
                          value={item.rate}
                          onChange={(e) =>
                            patchItem(item.id, { rate: Number(e.target.value) || 0 })
                          }
                        />
                      )}
                    </Field>
                    <Field label="Discount %">
                      {(id) => (
                        <TextInput
                          id={id}
                          type="number"
                          value={item.discount}
                          onChange={(e) =>
                            patchItem(item.id, { discount: Number(e.target.value) || 0 })
                          }
                        />
                      )}
                    </Field>
                  </div>

                  {doc.taxMode === "gst" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="HSN / SAC" hint="Required on Indian tax invoices.">
                        {(id) => (
                          <TextInput
                            id={id}
                            value={item.hsn}
                            onChange={(e) => patchItem(item.id, { hsn: e.target.value })}
                            placeholder="998314"
                          />
                        )}
                      </Field>
                      <Field label="GST rate">
                        {(id) => (
                          <Select
                            id={id}
                            value={item.taxRate}
                            onChange={(e) =>
                              patchItem(item.id, { taxRate: Number(e.target.value) })
                            }
                          >
                            {GST_RATES.map((r) => (
                              <option key={r} value={r}>
                                {r}%
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    </div>
                  )}
                </Card>
              ))}

              <Button
                onClick={() =>
                  setDoc((d) => ({
                    ...d,
                    items: [...d.items, emptyItem(d.items.at(-1)?.taxRate ?? 18)],
                  }))
                }
              >
                <Plus className="size-4" aria-hidden />
                Add an item
              </Button>
            </>
          )}

          {tab === "extras" && (
            <Card className="space-y-4 p-4">
              <Field label="Bank details" hint="Account number, IFSC, branch.">
                {(id) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={doc.bankDetails}
                    onChange={(e) => patch({ bankDetails: e.target.value })}
                  />
                )}
              </Field>

              {isIndian && (
                <Field label="UPI ID" hint="So they can pay from a phone.">
                  {(id) => (
                    <TextInput
                      id={id}
                      value={doc.upiId}
                      onChange={(e) => patch({ upiId: e.target.value })}
                      placeholder="yourname@bank"
                    />
                  )}
                </Field>
              )}

              <Field label="Terms">
                {(id) => (
                  <Textarea
                    id={id}
                    rows={2}
                    value={doc.terms}
                    onChange={(e) => patch({ terms: e.target.value })}
                  />
                )}
              </Field>

              <Field label="Notes">
                {(id) => (
                  <Textarea
                    id={id}
                    rows={2}
                    value={doc.notes}
                    onChange={(e) => patch({ notes: e.target.value })}
                  />
                )}
              </Field>

              <Checkbox
                label="Write the total out in words"
                checked={doc.showAmountInWords}
                onChange={(e) => patch({ showAmountInWords: e.target.checked })}
              />
              <Checkbox
                label="Round the total to a whole unit"
                checked={doc.roundOff}
                onChange={(e) => patch({ roundOff: e.target.checked })}
              />
            </Card>
          )}
        </div>

        {/* ------------------------------------------------------ preview */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted">Total</span>
              <span className="text-2xl font-semibold tracking-tight text-ink">
                {cash(totals.total)}
              </span>
            </div>
            {totals.taxTotal > 0 && (
              <p className="mt-1 text-xs text-muted">
                {cash(totals.taxable)} + {cash(totals.taxTotal)} tax
                {doc.taxMode === "gst" &&
                  (totals.intraState ? " (CGST + SGST)" : " (IGST)")}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" busy={exporting} onClick={exportPdf}>
                <Download className="size-4" aria-hidden />
                Download PDF
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  saveBlob(
                    toSavedFile("invoice", doc),
                    `${doc.number || "invoice"}.filesmith-invoice.json`,
                  )
                }
              >
                <Save className="size-4" aria-hidden />
                Save
              </Button>
              <Button size="sm" onClick={() => openInput.current?.click()}>
                <FolderOpen className="size-4" aria-hidden />
                Open
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  clearDraft(DRAFT_KEY);
                  setDoc(sampleInvoice(doc.kind));
                }}
              >
                <RotateCcw className="size-4" aria-hidden />
                Reset
              </Button>
              <input
                ref={openInput}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    setDoc(await readSavedFile<InvoiceDoc>(file, "invoice"));
                    setLoadError(null);
                  } catch (err) {
                    setLoadError(
                      err instanceof Error ? err.message : "Couldn't open that file.",
                    );
                  }
                }}
              />
            </div>

            <p className="mt-3 text-xs text-muted">
              {draft.pending
                ? "Saving…"
                : draft.savedAt
                  ? `Draft saved ${savedAgo}.`
                  : "Saves automatically as you type."}
            </p>
          </Card>

          <DocPreview
            pages={pages}
            building={building}
            error={error}
            warnings={result?.warnings}
            emptyMessage="Your invoice appears here as you fill it in."
          />
        </div>
      </div>
    </ToolShell>
  );
}
