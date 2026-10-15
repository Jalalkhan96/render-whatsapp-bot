'use strict';
// iLovePDF: PDF to PowerPoint — one slide per page with text boxes.
const { fs, path, loadPdfjs, ensureDirFor } = require('../lib/util.cjs');
const PptxGenJS = require('pptxgenjs');

module.exports = {
  command: 'pdf-to-pptx <input>',
  description: 'Convert PDF pages to PPTX slides (iLovePDF: PDF to PowerPoint)',
  options: [
    ['-o, --output <path>', 'Output PPTX path', null],
    ['--pages <spec>', 'Pages to convert (default: all)', null],
  ],
  action: async (input, opts) => {
    const doc = await loadPdfjs(input);
    let idx = [...Array(doc.numPages).keys()].map(i => i + 1);
    if (opts.pages) {
      const { parsePages } = require('../lib/util.cjs');
      idx = parsePages(opts.pages, doc.numPages).map(i => i + 1);
    }
    const pptx = new PptxGenJS();
    for (const p of idx) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const slide = pptx.addSlide();
      const rows = new Map();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const key = Math.round(it.transform[5] / 4) * 4;
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push({ x: it.transform[4], str: it.str });
      }
      const lines = [...rows.entries()].sort((a, b) => b[0] - a[0])
        .map(([, items]) => items.sort((a, b) => a.x - b.x).map(i => i.str).join(' '));
      slide.addText(lines.map(t => ({ text: t, options: { fontSize: 12 } })), { x: 0.5, y: 0.5, w: 9, h: 6.5 });
      slide.addText(`Page ${p}`, { x: 9, y: 7, w: 1, h: 0.3, fontSize: 8, color: '999999', align: 'right' });
    }
    const out = opts.output || path.basename(input, path.extname(input)) + '.pptx';
    ensureDirFor(out);
    await pptx.writeFile({ fileName: out });
    return `Converted ${idx.length} page(s) -> ${out}`;
  },
};
