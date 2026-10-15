'use strict';
// iLovePDF: Merge PDF — combine PDFs in the order you want.
const { loadPdf, savePdf, parsePages } = require('../lib/util.cjs');

module.exports = {
  command: 'merge <inputs...>',
  description: 'Merge multiple PDFs into one (iLovePDF: Merge PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'merged.pdf'],
    ['--pages <spec>', 'Per-file page selection, e.g. "1-3" (applies to every input)', null],
  ],
  action: async (inputs, opts) => {
    const out = await PDFDocument_create();
    for (const input of inputs) {
      const src = await loadPdf(input);
      const idx = opts.pages ? parsePages(opts.pages, src.getPageCount()) : src.getPageIndices();
      const pages = await out.copyPages(src, idx);
      pages.forEach(p => out.addPage(p));
    }
    await savePdf(out, opts.output);
    return `Merged ${inputs.length} file(s) -> ${opts.output}`;
  },
};

async function PDFDocument_create() {
  const { PDFDocument } = require('pdf-lib');
  return await PDFDocument.create();
}
