'use strict';
// iLovePDF: Sign PDF — stamp a signature image or typed signature (visual stamp).
const { fs, loadPdf, savePdf, hexToRgb, standardFont, cleanU8 } = require('../lib/util.cjs');

module.exports = {
  command: 'sign <input>',
  description: 'Stamp a signature image/text (iLovePDF: Sign PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'signed.pdf'],
    ['--image <path>', 'Signature image (png/jpg)', null],
    ['--text <t>', 'Typed signature text', null],
    ['--page <n>', 'Page number', '1'],
    ['--x <n>', 'X position', '100'],
    ['--y <n>', 'Y position', '100'],
    ['--width <n>', 'Stamp width', '180'],
  ],
  action: async (input, opts) => {
    if (!opts.image && !opts.text) throw new Error('Provide --image <path> or --text <t>');
    const doc = await loadPdf(input);
    const page = doc.getPage(parseInt(opts.page, 10) - 1);
    const w = parseFloat(opts.width);
    if (opts.image) {
      const bytes = cleanU8(fs.readFileSync(opts.image));
      const emb = opts.image.toLowerCase().endsWith('.png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const h = w * (emb.height / emb.width);
      page.drawImage(emb, { x: +opts.x, y: +opts.y, width: w, height: h });
    } else {
      const font = await standardFont(doc, 'helveticaBold');
      page.drawText(opts.text, { x: +opts.x, y: +opts.y, size: 24, font, color: hexToRgb('#1a3a8f') });
    }
    await savePdf(doc, opts.output);
    return `Signed -> ${opts.output} (visual stamp; not a cryptographic signature)`;
  },
};
