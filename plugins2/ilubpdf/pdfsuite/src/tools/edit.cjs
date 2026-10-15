'use strict';
// iLovePDF: Edit PDF — add text, images and shapes via a JSON spec file.
const { fs, loadPdf, savePdf, hexToRgb, standardFont, parsePages, cleanU8 } = require('../lib/util.cjs');

module.exports = {
  command: 'edit <input> <spec>',
  description: 'Add text/images/shapes from a JSON spec (iLovePDF: Edit PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'edited.pdf'],
  ],
  action: async (input, specPath, opts) => {
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const doc = await loadPdf(input);
    const font = await standardFont(doc, 'helvetica');
    const fontB = await standardFont(doc, 'helveticaBold');
    const pickFont = (n) => n === 'bold' ? fontB : font;
    let n = 0;
    for (const t of spec.texts || []) {
      const pages = t.pages ? parsePages(t.pages, doc.getPageCount()) : [t.page ? t.page - 1 : 0];
      for (const i of pages) {
        doc.getPage(i).drawText(t.text, {
          x: t.x || 50, y: t.y || 50, size: t.size || 12,
          font: pickFont(t.weight), color: hexToRgb(t.color || '#000000'),
          opacity: t.opacity ?? 1,
        });
        n++;
      }
    }
    for (const im of spec.images || []) {
      const bytes = cleanU8(fs.readFileSync(im.path));
      const emb = im.path.toLowerCase().endsWith('.png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const pages = im.pages ? parsePages(im.pages, doc.getPageCount()) : [im.page ? im.page - 1 : 0];
      for (const i of pages) {
        doc.getPage(i).drawImage(emb, {
          x: im.x || 50, y: im.y || 50,
          width: im.width || emb.width, height: im.height || emb.height,
          opacity: im.opacity ?? 1,
        });
        n++;
      }
    }
    for (const r of spec.rects || []) {
      const pages = r.pages ? parsePages(r.pages, doc.getPageCount()) : [r.page ? r.page - 1 : 0];
      for (const i of pages) {
        doc.getPage(i).drawRectangle({
          x: r.x, y: r.y, width: r.width, height: r.height,
          color: r.fill ? hexToRgb(r.fill) : undefined,
          borderColor: r.stroke ? hexToRgb(r.stroke) : undefined,
          borderWidth: r.strokeWidth ?? 1, opacity: r.opacity ?? 1,
        });
        n++;
      }
    }
    await savePdf(doc, opts.output);
    return `Applied ${n} edit(s) -> ${opts.output}`;
  },
};
