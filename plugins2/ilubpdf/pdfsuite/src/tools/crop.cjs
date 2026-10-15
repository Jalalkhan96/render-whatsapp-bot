'use strict';
// iLovePDF: Crop PDF — trim margins (sets the page CropBox).
const { loadPdf, savePdf, parsePages, PDFName } = require('../lib/util.cjs');

module.exports = {
  command: 'crop <input>',
  description: 'Crop page margins (iLovePDF: Crop PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'cropped.pdf'],
    ['--margin <n>', 'Crop this many points from every side', null],
    ['--margins <l,t,r,b>', 'Per-side crop in points, e.g. "36,36,36,72"', null],
    ['--pages <spec>', 'Pages to crop (default: all)', null],
  ],
  action: async (input, opts) => {
    let m;
    if (opts.margins) {
      m = String(opts.margins).split(',').map(Number);
      if (m.length !== 4 || m.some(isNaN)) throw new Error('--margins needs 4 numbers: l,t,r,b');
    } else if (opts.margin != null) {
      const v = Number(opts.margin); m = [v, v, v, v];
    } else throw new Error('Provide --margin <n> or --margins <l,t,r,b>');
    const [l, t, r, b] = m;
    const doc = await loadPdf(input);
    const idx = opts.pages ? parsePages(opts.pages, doc.getPageCount()) : doc.getPageIndices();
    for (const i of idx) {
      const page = doc.getPage(i);
      const { width, height } = page.getSize();
      page.node.set(PDFName.of('CropBox'), doc.context.obj([l, b, width - r, height - t]));
    }
    await savePdf(doc, opts.output);
    return `Cropped ${idx.length} page(s) -> ${opts.output}`;
  },
};
