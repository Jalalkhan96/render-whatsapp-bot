'use strict';
// iLovePDF: Redact PDF — black out matching text (overlay; see README limits).
const { fs, loadPdf, savePdf, loadPdfjs, rgb } = require('../lib/util.cjs');

module.exports = {
  command: 'redact <input>',
  description: 'Black out text matching a pattern (iLovePDF: Redact PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'redacted.pdf'],
    ['--find <text>', 'Literal text to redact (case-insensitive)', null],
    ['--regex <pattern>', 'Regular expression to redact', null],
  ],
  action: async (input, opts) => {
    if (!opts.find && !opts.regex) throw new Error('Provide --find <text> or --regex <pattern>');
    const matcher = opts.regex ? new RegExp(opts.regex, 'gi') : null;
    const needle = opts.find ? opts.find.toLowerCase() : null;
    const doc = await loadPdf(input);
    const pj = await loadPdfjs(input);
    let hits = 0;
    for (let p = 1; p <= pj.numPages; p++) {
      const page = await pj.getPage(p);
      const tc = await page.getTextContent();
      const vp = page.getViewport({ scale: 1 });
      const pdfPage = doc.getPage(p - 1);
      const { height } = pdfPage.getSize();
      const sy = height / vp.height; // pdfjs y is top-down; pdf-lib y is bottom-up
      for (const it of tc.items) {
        if (!it.str) continue;
        const match = matcher ? matcher.test(it.str) : it.str.toLowerCase().includes(needle);
        if (matcher) matcher.lastIndex = 0;
        if (!match) continue;
        const [a, b, c, d, e, f] = it.transform;
        const w = Math.hypot(a, b) * (it.width || it.str.length * 5);
        const h = Math.hypot(c, d) || 10;
        const x = e * (pdfPage.getSize().width / vp.width);
        const yTop = f;
        pdfPage.drawRectangle({
          x, y: height - (yTop * sy) - h * sy,
          width: w * (pdfPage.getSize().width / vp.width), height: h * sy + 2,
          color: rgb(0, 0, 0), borderWidth: 0,
        });
        hits++;
      }
    }
    await savePdf(doc, opts.output);
    return `Redacted ${hits} match(es) -> ${opts.output} (overlay redaction; see README)`;
  },
};
