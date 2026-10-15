'use strict';
// iLovePDF: Split PDF — separate pages into independent PDF files.
const { fs, path, loadPdf, savePdf, parsePages, ensureDirFor } = require('../lib/util.cjs');
const { PDFDocument } = require('pdf-lib');

module.exports = {
  command: 'split <input>',
  description: 'Split a PDF into separate files (iLovePDF: Split PDF)',
  options: [
    ['-o, --output <dir>', 'Output directory', 'split_out'],
    ['--pages <spec>', 'Page ranges per file, e.g. "1-2,3-5,6" (default: one file per page)', null],
    ['--prefix <name>', 'Output filename prefix', 'page'],
  ],
  action: async (input, opts) => {
    const src = await loadPdf(input);
    const n = src.getPageCount();
    const groups = opts.pages
      ? String(opts.pages).split(';').map(g => parsePages(g, n))
      : [...Array(n).keys()].map(i => [i]);
    ensureDirFor(path.join(opts.output, 'x'));
    const base = path.basename(input, path.extname(input));
    const made = [];
    for (let i = 0; i < groups.length; i++) {
      const doc = await PDFDocument.create();
      const pages = await doc.copyPages(src, groups[i]);
      pages.forEach(p => doc.addPage(p));
      const out = path.join(opts.output, `${opts.prefix || base}-part${i + 1}.pdf`);
      await savePdf(doc, out);
      made.push(out);
    }
    return `Split into ${made.length} file(s) in ${opts.output}/`;
  },
};
