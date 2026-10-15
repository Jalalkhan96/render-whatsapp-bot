'use strict';
// iLovePDF: Repair PDF — recover data from a damaged/corrupt PDF (best effort).
const { loadPdf, savePdf } = require('../lib/util.cjs');
const { PDFDocument } = require('pdf-lib');

module.exports = {
  command: 'repair <input>',
  description: 'Attempt to repair a damaged PDF (iLovePDF: Repair PDF)',
  options: [['-o, --output <path>', 'Output PDF path', 'repaired.pdf']],
  action: async (input, opts) => {
    let src;
    try {
      src = await loadPdf(input, { throwOnInvalidObject: false });
    } catch (e) {
      throw new Error(`Could not parse file at all: ${e.message}`);
    }
    const n = src.getPageCount();
    const out = await PDFDocument.create();
    let kept = 0;
    for (let i = 0; i < n; i++) {
      try {
        const [p] = await out.copyPages(src, [i]);
        out.addPage(p); kept++;
      } catch { /* skip unreadable page */ }
    }
    if (!kept) throw new Error('No readable pages found — file is beyond repair.');
    await savePdf(out, opts.output);
    return `Recovered ${kept}/${n} page(s) -> ${opts.output}`;
  },
};
