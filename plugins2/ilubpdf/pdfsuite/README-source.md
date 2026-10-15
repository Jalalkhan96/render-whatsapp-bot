# pdfsuite-node

A **Node.js port of the [iLovePDF](https://www.ilovepdf.com/) conversion system** — every tool
scraped from ilovepdf.com, rebuilt as a local command-line toolkit **and** a programmatic
library. No uploads, no accounts, no watermarks — your files never leave your machine.

> Scraped from https://www.ilovepdf.com/ on 2026-10-02. iLovePDF lists **28 tools** across
> 6 categories (Organize, Optimize, Convert, Edit, Security, Intelligence). This package
> implements **30 commands** covering all of them (details + honest limitations below).

## Install

Requires **Node.js 18+**.

```bash
npm install
# optional global CLI:
npm link            # or: node bin/pdfsuite.js <command>
```

Optional system tools that unlock extra features:

| Tool | Enables | Install |
|------|---------|---------|
| `tesseract` | `ocr` (searchable PDFs from scans) | `apt install tesseract-ocr` |

## Quick start

```bash
node bin/pdfsuite.js merge a.pdf b.pdf -o combined.pdf
node bin/pdfsuite.js compress big.pdf -o small.pdf
node bin/pdfsuite.js pdf-to-word report.pdf
node bin/pdfsuite.js watermark contract.pdf --text "DRAFT" -o draft.pdf
node bin/pdfsuite.js --help          # list all 30 commands
node bin/pdfsuite.js merge --help    # help for one command
```

## iLovePDF → pdfsuite command map

### Organize PDF

| iLovePDF tool | pdfsuite command | Example |
|---|---|---|
| Merge PDF | `merge` | `pdfsuite merge a.pdf b.pdf -o out.pdf [--pages 1-3]` |
| Split PDF | `split` | `pdfsuite split in.pdf -o parts/ [--pages "1-2;3-5;6"]` |
| Organize PDF | `organize` | `pdfsuite organize in.pdf --order 3,1-2 --delete 5 -o out.pdf` |

### Optimize PDF

| iLovePDF tool | pdfsuite command | Example |
|---|---|---|
| Compress PDF | `compress` | `pdfsuite compress in.pdf -o small.pdf [--level 1-3]` |
| Repair PDF | `repair` | `pdfsuite repair broken.pdf -o fixed.pdf` |

### Convert PDF

| iLovePDF tool | pdfsuite command | Example |
|---|---|---|
| PDF to Word | `pdf-to-word` | `pdfsuite pdf-to-word in.pdf [-o out.docx]` |
| Word to PDF | `word-to-pdf` | `pdfsuite word-to-pdf in.docx` |
| PDF to PowerPoint | `pdf-to-pptx` | `pdfsuite pdf-to-pptx in.pdf` |
| PowerPoint to PDF | `pptx-to-pdf` | `pdfsuite pptx-to-pdf in.pptx` |
| PDF to Excel | `pdf-to-excel` | `pdfsuite pdf-to-excel in.pdf` |
| Excel to PDF | `excel-to-pdf` | `pdfsuite excel-to-pdf in.xlsx [--sheet Sheet1]` |
| PDF to JPG | `pdf-to-jpg` | `pdfsuite pdf-to-jpg in.pdf -o imgs/ [--format jpg\|png] [--scale 2]` |
| JPG to PDF | `jpg-to-pdf` | `pdfsuite jpg-to-pdf *.jpg -o out.pdf [--orientation auto]` |
| HTML to PDF | `html-to-pdf` | `pdfsuite html-to-pdf page.html` |
| PDF to PDF/A | `pdf-to-pdfa` | `pdfsuite pdf-to-pdfa in.pdf [--title T] [--author A]` |
| PDF to Markdown | `pdf-to-markdown` | `pdfsuite pdf-to-markdown in.pdf` |
| OCR PDF | `ocr` | `pdfsuite ocr scan.pdf -o searchable.pdf` *(needs tesseract)* |
| — | `extract-text` | `pdfsuite extract-text in.pdf -o out.txt` |
| — | `extract-images` | `pdfsuite extract-images in.pdf -o imgs/` |

### Edit PDF

| iLovePDF tool | pdfsuite command | Example |
|---|---|---|
| Edit PDF | `edit` | `pdfsuite edit in.pdf spec.json -o out.pdf` |
| Watermark | `watermark` | `pdfsuite watermark in.pdf --text CONFIDENTIAL -o out.pdf` |
| Rotate PDF | `rotate` | `pdfsuite rotate in.pdf --angle 90 [--pages 1-3]` |
| Page numbers | `pagenumbers` | `pdfsuite pagenumbers in.pdf --position bottom-center --format "Page {n} of {total}"` |
| Crop PDF | `crop` | `pdfsuite crop in.pdf --margin 36` |
| Redact PDF | `redact` | `pdfsuite redact in.pdf --find "secret" -o out.pdf` |
| Sign PDF | `sign` | `pdfsuite sign in.pdf --image sig.png --page 2 -o out.pdf` |
| PDF Forms | `forms` | `pdfsuite forms in.pdf --list` / `--fill data.json [--flatten]` |

### PDF Security

| iLovePDF tool | pdfsuite command | Example |
|---|---|---|
| Protect PDF | `protect` | `pdfsuite protect in.pdf --user-password s3cret -o out.pdf` |
| Unlock PDF | `unlock` | `pdfsuite unlock in.pdf --password s3cret -o out.pdf` |

### PDF Intelligence

| iLovePDF tool | pdfsuite command | Example |
|---|---|---|
| Compare PDF | `compare` | `pdfsuite compare old.pdf new.pdf -o diff.md` |
| AI Summarizer | `summarize` | `pdfsuite summarize long.pdf [--sentences 8]` *(offline extractive)* |
| Translate PDF | `translate` | `pdfsuite translate in.pdf --to ur` *(needs TRANSLATE_ENDPOINT)* |
| Create a workflow | `workflow` | `pdfsuite workflow flow.json` |

Not ported: **Scan to PDF** (needs a phone camera — use `jpg-to-pdf` on your scans).

## Common recipes

**Prepare a document for sending:** compress → watermark → protect
```bash
pdfsuite compress report.pdf -o report-small.pdf
pdfsuite watermark report-small.pdf --text "CONFIDENTIAL" --opacity 0.2 -o report-wm.pdf
pdfsuite protect report-wm.pdf --user-password "s3cret!" -o report-final.pdf
```

**Batch workflow file** (`flow.json`) — same thing, one command:
```json
{
  "steps": [
    { "tool": "compress",  "input": "report.pdf",       "output": "report-small.pdf" },
    { "tool": "watermark", "input": "report-small.pdf", "output": "report-wm.pdf", "options": { "text": "CONFIDENTIAL", "opacity": 0.2 } },
    { "tool": "protect",   "input": "report-wm.pdf",    "output": "report-final.pdf", "options": { "userPassword": "s3cret!" } }
  ]
}
```
```bash
pdfsuite workflow flow.json
```

**Fill a form and flatten it:**
```bash
pdfsuite forms application.pdf --list
pdfsuite forms application.pdf --fill '{"full_name":"Jalal Khan","email":"jalalmjk96@gmail.com"}' --flatten -o filled.pdf
```

**Edit spec** (`spec.json`) for the `edit` command:
```json
{
  "texts":  [{ "page": 1, "x": 60, "y": 700, "text": "Approved", "size": 16, "weight": "bold", "color": "#1a7f37" }],
  "images": [{ "page": 1, "path": "logo.png", "x": 450, "y": 750, "width": 100 }],
  "rects":  [{ "pages": "1-3", "x": 50, "y": 50, "width": 495, "height": 740, "stroke": "#ff0000", "strokeWidth": 2 }]
}
```

## Programmatic API

Every tool is also a plain async function:

```js
const pdfsuite = require('pdfsuite-node'); // or require('./src')

await pdfsuite.merge.action(['a.pdf', 'b.pdf'], { output: 'out.pdf' });
await pdfsuite['pdf-to-word'].action('in.pdf', { output: 'out.docx' });
await pdfsuite.watermark.action('in.pdf', { text: 'DRAFT', output: 'out.pdf' });
await pdfsuite.forms.action('form.pdf', null, { fill: '{"name":"Jalal"}', flatten: true, output: 'done.pdf' });

// shared helpers
const { loadPdf, savePdf, parsePages } = require('pdfsuite-node').util;
```

## Project structure

```
pdfsuite-node/
├── bin/pdfsuite.js        # CLI entry (commander, auto-registers all tools)
├── src/
│   ├── index.js           # tool registry + programmatic API
│   ├── lib/util.js        # shared helpers (load/save, page specs, pdf.js rendering)
│   └── tools/             # one file per tool (30 tools)
│       ├── merge.js split.js organize.js
│       ├── compress.js repair.js
│       ├── pdf-to-word.js word-to-pdf.js pdf-to-pptx.js pptx-to-pdf.js
│       ├── pdf-to-excel.js excel-to-pdf.js pdf-to-jpg.js jpg-to-pdf.js
│       ├── html-to-pdf.js pdf-to-pdfa.js pdf-to-markdown.js ocr.js
│       ├── extract-text.js extract-images.js
│       ├── edit.js watermark.js rotate.js pagenumbers.js crop.js
│       ├── redact.js sign.js forms.js
│       ├── protect.js unlock.js
│       └── compare.js summarize.js translate.js workflow.js
├── test/smoke.js          # end-to-end test (npm test)
├── README.md
└── LICENSE (MIT)
```

## Honest limitations (vs. ilovepdf.com)

This is a faithful local rebuild, not a byte-for-byte clone. Know the edges:

- **Compress** — recompresses PDF object streams; it will not downsample embedded images
  aggressively the way iLovePDF's server does. For heavy image PDFs, pre-shrink images first.
- **Word/PowerPoint → PDF** — best-effort *text layout* via `mammoth`/XML parsing. Complex
  formatting, images-in-slides and exact pagination need LibreOffice
  (`soffice --headless --convert-to pdf`). The reverse direction (PDF → Word/PPTX) extracts
  real text into editable files.
- **HTML → PDF** — renders semantic HTML (headings/paragraphs/lists). For pixel-perfect
  web pages use headless Chrome (`chrome --headless --print-to-pdf`).
- **PDF/A** — performs archival *normalization* (clean resave + metadata). Full PDF/A-1b
  conformance (embedded fonts, sRGB OutputIntent) must be validated with veraPDF.
- **Redact** — draws opaque boxes over matched text. The underlying text objects remain in
  the file; for legal-grade redaction, verify with a validator.
- **Sign** — a visual signature stamp, not a cryptographic digital signature.
- **Summarizer** — offline *extractive* summarization (no LLM); surprisingly good for reports.
- **Translate** — a provider hook: set `TRANSLATE_ENDPOINT` to any HTTP endpoint accepting
  `POST {text, target}` and returning `{text}`. Example 10-line server:
  ```js
  // translate-server.js — plug in any translation API/SDK here
  const http = require('http');
  http.createServer(async (req, res) => {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      const { text, target } = JSON.parse(body);
      const translated = await myTranslate(text, target); // your provider
      res.end(JSON.stringify({ text: translated }));
    });
  }).listen(8787);
  // then: TRANSLATE_ENDPOINT=http://localhost:8787 pdfsuite translate in.pdf --to ur
  ```
- **OCR** — requires the `tesseract` binary; quality depends on scan resolution.

## Test

```bash
npm test   # builds sample PDFs and runs 25 tools end-to-end
```

## License

MIT — see [LICENSE](LICENSE). Not affiliated with iLovePDF; tool names are used for
feature-parity mapping only.
