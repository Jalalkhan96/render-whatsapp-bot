'use strict';
// iLovePDF: OCR PDF — make scanned PDFs searchable using the `tesseract` CLI if installed.
const { execFileSync } = require('child_process');
const { fs, path, loadPdfjs, renderPagePng, ensureDirFor } = require('../lib/util.cjs');

function hasTesseract() {
  try { execFileSync('tesseract', ['--version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

module.exports = {
  command: 'ocr <input>',
  description: 'OCR a scanned PDF into searchable PDF (iLovePDF: OCR PDF, needs tesseract)',
  options: [
    ['-o, --output <path>', 'Output searchable PDF', 'ocr.pdf'],
    ['--lang <code>', 'Tesseract language code', 'eng'],
  ],
  action: async (input, opts) => {
    if (!hasTesseract()) {
      throw new Error('tesseract is not installed. Install it (e.g. `apt install tesseract-ocr`) and retry.');
    }
    const doc = await loadPdfjs(input);
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pdfsuite-ocr-'));
    const pdfs = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const png = await renderPagePng(await doc.getPage(p), 3);
      const img = path.join(tmp, `p${p}.png`);
      fs.writeFileSync(img, png);
      const base = path.join(tmp, `p${p}`);
      execFileSync('tesseract', [img, base, '-l', opts.lang, 'pdf'], { stdio: 'ignore' });
      pdfs.push(base + '.pdf');
    }
    // Merge OCR'd pages back together.
    const merge = require('./merge.cjs');
    const out = opts.output;
    await merge.action(pdfs, { output: out });
    fs.rmSync(tmp, { recursive: true, force: true });
    return `OCR complete (${doc.numPages} pages) -> ${out}`;
  },
};
