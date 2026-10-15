'use strict';
// iLovePDF: JPG to PDF — convert images to PDF with orientation/margin control.
const { fs, loadPdf, savePdf, cleanU8 } = require('../lib/util.cjs');
const { PDFDocument, PageSizes } = require('pdf-lib');

async function embedAuto(doc, bytes, name) {
  bytes = cleanU8(bytes);
  const n = name.toLowerCase();
  if (n.endsWith('.png')) return await doc.embedPng(bytes);
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return await doc.embedJpg(bytes);
  try { return await doc.embedJpg(bytes); } catch { return await doc.embedPng(bytes); }
}

module.exports = {
  command: 'jpg-to-pdf <inputs...>',
  description: 'Convert JPG/PNG images to PDF (iLovePDF: JPG to PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'images.pdf'],
    ['--orientation <o>', 'portrait|landscape|auto (auto = match image)', 'auto'],
    ['--margin <n>', 'Page margin in points', '36'],
    ['--pagesize <s>', 'A4|Letter (ignored in auto orientation fit)', 'A4'],
  ],
  action: async (inputs, opts) => {
    const doc = await PDFDocument.create();
    const margin = parseFloat(opts.margin);
    for (const input of inputs) {
      const img = await embedAuto(doc, fs.readFileSync(input), input);
      let w = PageSizes[opts.pagesize]?.[0] || PageSizes.A4[0];
      let h = PageSizes[opts.pagesize]?.[1] || PageSizes.A4[1];
      const imgLandscape = img.width > img.height;
      if (opts.orientation === 'auto' ? imgLandscape : opts.orientation === 'landscape') [w, h] = [h, w];
      const page = doc.addPage([w, h]);
      const maxW = w - margin * 2, maxH = h - margin * 2;
      const s = Math.min(maxW / img.width, maxH / img.height);
      const dw = img.width * s, dh = img.height * s;
      page.drawImage(img, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh });
    }
    await savePdf(doc, opts.output);
    return `Converted ${inputs.length} image(s) -> ${opts.output}`;
  },
};
