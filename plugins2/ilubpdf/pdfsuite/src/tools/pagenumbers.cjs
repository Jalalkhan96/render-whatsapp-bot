'use strict';
// iLovePDF: Page numbers — add page numbers with position/typography control.
const { loadPdf, savePdf, hexToRgb, standardFont } = require('../lib/util.cjs');

const POSITIONS = {
  'top-left': (w, h) => [36, h - 30], 'top-center': (w, h, tw) => [w / 2 - tw / 2, h - 30],
  'top-right': (w, h, tw) => [w - tw - 36, h - 30],
  'bottom-left': (w) => [36, 24], 'bottom-center': (w, h, tw) => [w / 2 - tw / 2, 24],
  'bottom-right': (w, h, tw) => [w - tw - 36, 24],
};

module.exports = {
  command: 'pagenumbers <input>',
  description: 'Add page numbers (iLovePDF: Page numbers)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'numbered.pdf'],
    ['--position <p>', 'top-left|top-center|top-right|bottom-left|bottom-center|bottom-right', 'bottom-center'],
    ['--size <n>', 'Font size', '11'],
    ['--color <hex>', 'Color', '#333333'],
    ['--start <n>', 'First number', '1'],
    ['--format <f>', 'Use {n} for number, {total} for page count. E.g. "Page {n} of {total}"', '{n}'],
  ],
  action: async (input, opts) => {
    if (!POSITIONS[opts.position]) throw new Error(`Bad --position (choose: ${Object.keys(POSITIONS).join('|')})`);
    const doc = await loadPdf(input);
    const font = await standardFont(doc);
    const size = parseFloat(opts.size), start = parseInt(opts.start, 10);
    const pages = doc.getPages(), total = pages.length;
    pages.forEach((page, i) => {
      const label = opts.format.replace('{n}', start + i).replace('{total}', total);
      const { width, height } = page.getSize();
      const tw = font.widthOfTextAtSize(label, size);
      const [x, y] = POSITIONS[opts.position](width, height, tw);
      page.drawText(label, { x, y, size, font, color: hexToRgb(opts.color) });
    });
    await savePdf(doc, opts.output);
    return `Numbered ${total} page(s) -> ${opts.output}`;
  },
};
