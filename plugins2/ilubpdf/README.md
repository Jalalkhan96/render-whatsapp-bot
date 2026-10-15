# ABIX ILP PDF Suite

Integrated from the supplied `pdfsuite-node-ilovepdf-port.zip`. The supplied PDF/reference documents the iLovePDF-compatible tool set: organize, optimize, conversions, editing, security and intelligence/workflow features. fileciteturn3file0L24-L25

Active bot path: `plugins2/ilubpdf/`.

`-ilp` on an image converts the image to PDF. `-ilpmenu` shows the separate ILP menu. Each tool has its own `ilp...` command file so the MYBOT command loader can register the features independently.

Reply-to-file workflow:
- Single-file tools: reply to the input file/image.
- Multi-file tools: reply to a ZIP containing the required inputs.
- `-ilpmerge`: ZIP with 2+ PDFs.
- `-ilpcompare`: ZIP with exactly 2 PDFs.
- `-ilpjpg2pdf`: ZIP with images.
- `-ilpedit`: ZIP with PDF + JSON edit spec, or inline JSON.
- `-ilpsign`: ZIP with PDF + signature image, or `--text`.
- `-ilpforms`: ZIP with PDF + JSON data, or inline JSON.
- `-ilpworkflow`: workflow JSON, optionally with its input files in a ZIP.

ILP processing uses the OS temporary directory and deletes temporary files after the result is sent. No persistent ILP storage directory is created.

The supplied package itself notes that OCR needs Tesseract and translation needs `TRANSLATE_ENDPOINT`. fileciteturn3file0L211-L228
