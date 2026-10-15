'use strict';
// iLovePDF: Organize PDF — reorder, delete, duplicate pages.
const { loadPdf, savePdf, parsePages } = require('../lib/util.cjs');
const { PDFDocument } = require('pdf-lib');

module.exports = {
  command: 'organize <input>',
  description: 'Reorder/delete/duplicate pages (iLovePDF: Organize PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'organized.pdf'],
    ['--order <spec>', 'New page order, e.g. "3,1-2" (duplicates allowed). Omit to keep order.', null],
    ['--delete <spec>', 'Pages to delete, e.g. "2,5-6"', null],
  ],
  action: async (input, opts) => {
    const src = await loadPdf(input);
    const n = src.getPageCount();
    let idx;
    if (opts.order) {
      idx = [];
      for (const part of String(opts.order).split(',')) {
        const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
        if (!m) throw new Error(`Bad order part: "${part}"`);
        const a = +m[1], b = m[2] ? +m[2] : a;
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
          if (i < 1 || i > n) throw new Error(`Page ${i} out of range (1-${n})`);
          idx.push(i - 1);
        }
      }
    } else {
      idx = [...Array(n).keys()];
    }
    if (opts.delete) {
      const del = new Set(parsePages(opts.delete, n));
      idx = idx.filter(i => !del.has(i));
    }
    if (!idx.length) throw new Error('No pages left after organize operation.');
    const doc = await PDFDocument.create();
    (await doc.copyPages(src, idx)).forEach(p => doc.addPage(p));
    await savePdf(doc, opts.output);
    return `Organized ${idx.length} page(s) -> ${opts.output}`;
  },
};
