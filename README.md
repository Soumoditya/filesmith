# Filesmith

**Every file tool. Free. In your browser.**

Edit, convert, create and clean up documents, images and media — without
paywalls, sign-ups, or handing your files to a stranger's server.

---

## Why this exists

If you need to merge two PDFs, you currently choose between a site that caps
you at two tasks a day, one that stamps a watermark on the result, and one
that wants your credit card. All of them ask you to upload the file first —
your bank statement, your passport scan, your signed contract — to a server
you know nothing about.

Filesmith does the work in your browser instead.

## How it works, and why that matters

Every tool here is code that runs on **your** computer. When you open a file,
it's read into your browser's memory, processed there, and handed straight
back to you. It is never uploaded.

That single decision is what makes everything else possible:

- **It's genuinely free.** Processing a file costs us nothing, because it
  happens on your machine. There's no server bill to recoup, so there's no
  paid tier hiding behind the useful buttons.
- **There are no limits.** No daily task count, no file size cap, no
  watermarks. The only ceiling is your own computer's memory.
- **It's private by construction, not by policy.** We can't read your
  documents, sell them, or leak them, because we never receive them. You don't
  have to trust a privacy policy — open your browser's Network tab while you
  use a tool and watch nothing get sent.
- **It works offline.** After your first visit the tools are cached, so the
  site keeps working with no connection at all.

## Tools

| Area | What's in it |
| --- | --- |
| **Documents** | Merge, split, organise, compress, sign, redact, protect, OCR, PDF ↔ Word |
| **Images** | Convert, compress, resize, crop, watermark, favicon generator |
| **Media** | Convert and trim video and audio, extract audio, compress, video → GIF |
| **Create** | Text → PDF, QR codes (link, WiFi, vCard, bulk), invoices, resumes |
| **Clean** | Remove backgrounds and unwanted objects, using AI that runs on your device |
| **Utilities** | Zip, spreadsheets, Base64, checksums |

Tools marked *Soon* in the app aren't built yet. They're listed so you can see
what's coming rather than hunting for something that isn't there.

## Built with

Everything is free and permissively licensed — no paid services anywhere in
the stack.

| | |
| --- | --- |
| App | Vite, React 19, TypeScript, Tailwind CSS v4 |
| PDF | [`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib), `pdfjs-dist` |
| Media | [`mediabunny`](https://github.com/Vanilagy/mediabunny) (WebCodecs), `ffmpeg.wasm` fallback |
| Images | `@jsquash/*` (from Squoosh), Canvas |
| On-device AI | `onnxruntime-web` with WebGPU, falling back to WASM |
| Heavy work | Web Workers via Comlink, so the interface never freezes |

Media processing deliberately uses **mediabunny** rather than the more obvious
`ffmpeg.wasm`: it's ~5 kB instead of a 32 MB download, uses the browser's
hardware video encoder, and streams — so a 10 GB file peaks under 200 MB of
RAM instead of killing the tab.

## Running it locally

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build    # type-check and build to dist/
npm test         # unit tests
npm run icons    # regenerate the icon set from the brand mark
```

## Honest limitations

Rather than let you find these out the hard way:

- **Editing PDF text** covers the old text and types new text over it. True
  reflow editing doesn't exist in any free client-side library.
- **PDF → Word** is reliable for text documents and degrades on complex
  multi-column layouts.
- **Word → PDF** re-renders the document, so a heavily styled `.docx` won't be
  pixel-identical to Microsoft Word.
- **The AI tools** need a reasonably modern browser, and download a model file
  the first time you use them (cached afterwards).
- **Filesmith has no video downloader** and won't be getting one. Sites that
  offer this bypass platform protections, which a US court found can breach
  DMCA §1201 in February 2026 — even for public videos. A guide in the app
  explains what to use on your own machine instead.

## Licence

MIT. See [LICENSE](LICENSE).
