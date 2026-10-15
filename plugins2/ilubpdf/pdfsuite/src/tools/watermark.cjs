'use strict';
// iLovePDF: Watermark — stamp text over the PDF.
const { loadPdf, savePdf, hexToRgb, standardFont } = require('../lib/util.cjs');
const { degrees } = require('pdf-lib');

module.exports = {
  command: 'watermark <input>',
  description: 'Stamp a text watermark on every page (iLovePDF: Watermark)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'watermarked.pdf'],
    ['--text <t>', 'Watermark text', 'CONFIDENTIAL'],
    ['--size <n>', 'Font size', '48'],
    ['--color <hex>', 'Text color', '#888888'],
    ['--opacity <n>', '0-1', '0.25'],
    ['--angle <n>', 'Rotation degrees', '45'],
    ['--pages <spec>', 'Pages to stamp, e.g. "1-3" (default: all)', null],
  ],
  action: async (input, opts) => {
    const doc = await loadPdf(input);
    const font = await standardFont(doc, 'helveticaBold');
    const size = parseFloat(opts.size), opacity = parseFloat(opts.opacity), angle = parseFloat(opts.angle);
    const pages = opts.pages
      ? require('../lib/util.cjs').parsePages(opts.pages, doc.getPageCount()).map(i => doc.getPage(i))
      : doc.getPages();
    for (const page of pages) {
      const { width, height } = page.getSize();
      const tw = font.widthOfTextAtSize(opts.text, size);
      page.drawText(opts.text, {
        x: width / 2 - tw / 2, y: height / 2,
        size, font, color: hexToRgb(opts.color), opacity, rotate: degrees(angle),
      });
    }
    await savePdf(doc, opts.output);
    return `Watermarked ${pages.length} page(s) -> ${opts.output}`;
  },
};
