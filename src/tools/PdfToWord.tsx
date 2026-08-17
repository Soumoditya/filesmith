import { AlertTriangle, FileType2 } from "lucide-react";
import { useEffect, useState } from "react";
import { DropZone } from "../components/DropZone";
import { FileHeader } from "../components/FileHeader";
import { usePdfDocument } from "../components/PdfThumb";
import { ResultCard, type OutputFile } from "../components/ResultCard";
import { ToolShell } from "../components/ToolShell";
import {
  Button,
  Card,
  Checkbox,
  Notice,
  ProgressBar,
  Spinner,
} from "../components/ui";
import { baseNameOf } from "../lib/files";
import { claimFiles } from "../lib/handoff";
import { openPdf } from "../lib/pdfRender";
import { getTool } from "../lib/registry";
import { useToolJob } from "../lib/useToolJob";
import { itemsToParagraphs, type PositionedItem } from "../lib/wordConvert";

const TOOL = getTool("pdf-to-word")!;

export default function PdfToWord() {
  const [file, setFile] = useState<File | null>(null);
  const [keepHeadings, setKeepHeadings] = useState(true);
  const [pageBreaks, setPageBreaks] = useState(false);
  const [scanned, setScanned] = useState(false);
  const job = useToolJob<OutputFile[]>();

  const pdf = usePdfDocument(file);

  useEffect(() => {
    const staged = claimFiles();
    if (staged?.[0]) setFile(staged[0]);
  }, []);

  const startOver = () => {
    setFile(null);
    setScanned(false);
    job.reset();
  };

  const convert = async () => {
    if (!file) return;

    await job.run(async (report) => {
      const [{ Document, HeadingLevel, Packer, Paragraph, TextRun }, opened] =
        await Promise.all([import("docx"), openPdf(file)]);

      const children: InstanceType<typeof Paragraph>[] = [];
      let totalCharacters = 0;

      try {
        for (let pageNumber = 1; pageNumber <= opened.doc.numPages; pageNumber++) {
          const page = await opened.doc.getPage(pageNumber);
          const content = await page.getTextContent();

          // pdf.js gives a transform matrix per item; index 5 is the baseline
          // y, index 4 the x, and the scale factors carry the font size.
          const items: PositionedItem[] = content.items.flatMap((item) => {
            if (!("str" in item)) return [];
            const t = (item as unknown as { transform: number[] }).transform;
            const fontName = (item as unknown as { fontName?: string }).fontName ?? "";
            return [
              {
                text: item.str,
                x: t?.[4] ?? 0,
                y: t?.[5] ?? 0,
                height: Math.abs(t?.[3] ?? 11) || 11,
                bold: /bold|black|heavy/i.test(fontName),
              },
            ];
          });

          page.cleanup();

          const paragraphs = itemsToParagraphs(items);
          totalCharacters += paragraphs.reduce((sum, p) => sum + p.text.length, 0);

          for (const paragraph of paragraphs) {
            const heading =
              keepHeadings && paragraph.heading > 0
                ? paragraph.heading === 1
                  ? HeadingLevel.HEADING_1
                  : paragraph.heading === 2
                    ? HeadingLevel.HEADING_2
                    : HeadingLevel.HEADING_3
                : undefined;

            children.push(
              new Paragraph({
                heading,
                bullet: paragraph.bullet ? { level: 0 } : undefined,
                spacing: { after: heading ? 120 : 160 },
                children: [
                  new TextRun({
                    text: paragraph.text,
                    bold: heading ? true : undefined,
                    size: heading ? undefined : 22,
                  }),
                ],
              }),
            );
          }

          if (pageBreaks && pageNumber < opened.doc.numPages) {
            children.push(new Paragraph({ children: [], pageBreakBefore: true }));
          }

          report(pageNumber, opened.doc.numPages);
        }
      } finally {
        await opened.close();
      }

      // Almost no text means the PDF is a scan, and the .docx would be empty.
      setScanned(totalCharacters < 40 * Math.max(opened.doc.numPages, 1));

      const doc = new Document({
        creator: "Filesmith",
        title: baseNameOf(file.name),
        styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
        sections: [{ children }],
      });

      return [
        { name: `${baseNameOf(file.name)}.docx`, blob: await Packer.toBlob(doc) },
      ];
    });
  };

  if (!file) {
    return (
      <ToolShell tool={TOOL}>
        <DropZone
          onFiles={(files) => setFile(files[0])}
          accept=".pdf,application/pdf"
          title="Drop a PDF here"
          hint="Get an editable Word document back."
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell
      tool={TOOL}
      caveat={
        <>
          A PDF stores positioned letters, not paragraphs, so the structure has to
          be worked out from the layout. Ordinary documents — reports, letters,
          articles — convert well. Multi-column pages, forms and anything with a
          complex layout will come out reordered, and no tool does much better
          without guesswork.
        </>
      }
    >
      <div className="space-y-5">
        <FileHeader
          file={file}
          detail={pdf.pageCount > 0 ? `${pdf.pageCount} pages` : undefined}
          onClear={startOver}
          disabled={job.busy}
        />

        {pdf.error && (
          <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
            {pdf.error}
          </Notice>
        )}

        {pdf.loading && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <Spinner /> Reading the document…
          </div>
        )}

        {scanned && (
          <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>
            There’s almost no text in this PDF, so the Word file will be nearly
            empty. It’s a scan — the words are part of the page image. Run{" "}
            <a href="/t/ocr-pdf" className="font-medium underline underline-offset-2">
              Make a scan searchable
            </a>{" "}
            over it first.
          </Notice>
        )}

        {job.result ? (
          <ResultCard
            files={job.result}
            headline="Word document ready"
            detail="Open it in Word, Google Docs or LibreOffice and edit freely."
            onStartOver={startOver}
          />
        ) : (
          pdf.doc && (
            <>
              <Card className="space-y-3 p-5">
                <Checkbox
                  label="Turn larger text into proper headings"
                  checked={keepHeadings}
                  onChange={(e) => setKeepHeadings(e.target.checked)}
                />
                <Checkbox
                  label="Start a new page where the PDF did"
                  checked={pageBreaks}
                  onChange={(e) => setPageBreaks(e.target.checked)}
                />
                <p className="text-xs leading-relaxed text-muted">
                  Leaving page breaks off lets the text reflow naturally, which is
                  usually what you want when the point is to edit it.
                </p>
              </Card>

              {job.error && (
                <Notice tone="danger" icon={<AlertTriangle className="size-4" />}>
                  {job.error}
                </Notice>
              )}

              {job.busy && (
                <div className="space-y-1.5">
                  <ProgressBar percent={job.progress ?? 0} />
                  <p className="text-xs text-muted">
                    Reading page {Math.round(((job.progress ?? 0) / 100) * pdf.pageCount)}{" "}
                    of {pdf.pageCount}…
                  </p>
                </div>
              )}

              <Button variant="primary" size="lg" busy={job.busy} onClick={convert}>
                <FileType2 className="size-4" aria-hidden />
                Convert to Word
              </Button>
            </>
          )
        )}
      </div>
    </ToolShell>
  );
}
