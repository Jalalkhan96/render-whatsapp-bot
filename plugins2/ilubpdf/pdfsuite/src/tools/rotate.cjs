'use strict';
// iLovePDF: Rotate PDF.
const { loadPdf, savePdf, parsePages, degrees } = require('../lib/util.cjs');
const { degrees: deg } = require('pdf-lib');

module.exports = {
  command: 'rotate <input>',
  description: 'Rotate pages (iLovePDF: Rotate PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'rotated.pdf'],
    ['--angle <n>', '90, 180 or 270 (clockwise)', '90'],
    ['--pages <spec>', 'Pages to rotate, e.g. "1,3-5" (default: all)', null],
  ],
  action: async (input, opts) => {
    const angle = parseInt(opts.angle, 10);
    if (![90, 180, 270].includes(angle)) throw new Error('--angle must be 90, 180 or 270');
    const doc = await loadPdf(input);
    const idx = opts.pages ? parsePages(opts.pages, doc.getPageCount()) : doc.getPageIndices();
    for (const i of idx) {
      const page = doc.getPage(i);
      page.setRotation(deg((page.getRotation().angle + angle) % 360));
    }
    await savePdf(doc, opts.output);
    return `Rotated ${idx.length} page(s) by ${angle}° -> ${opts.output}`;
  },
};
