'use strict';
// iLovePDF: Word to PDF — best-effort DOCX -> PDF text layout (see README).
const { fs, path, savePdf, standardFont, ensureDirFor } = require('../lib/util.cjs');
const { PDFDocument } = require('pdf-lib');
const mammoth = require('mammoth');

module.exports = {
  command: 'word-to-pdf <input>',
  description: 'Convert DOCX to PDF, text layout (iLovePDF: Word to PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', null],
    ['--size <n>', 'Base font size', '12'],
  ],
  action: async (input, opts) => {
    const { value: html } = await mammoth.convertToHtml({ path: input });
    // Flatten HTML to styled blocks: h1-h3, p, li
    const blocks = [];
    const re = /<(h[1-3]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(html))) {
      const tag = m[1].toLowerCase();
      const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) blocks.push({ tag, text });
    }
    if (!blocks.length) throw new Error('No readable text found in DOCX.');
    const doc = await PDFDocument.create();
    const font = await standardFont(doc, 'helvetica');
    const fontB = await standardFont(doc, 'helveticaBold');
    const base = parseFloat(opts.size);
    let page = doc.addPage(), { width, height } = page.getSize();
    let y = height - 60;
    const newPage = () => { page = doc.addPage(); ({ width, height } = page.getSize()); y = height - 60; };
    for (const b of blocks) {
      const size = b.tag === 'h1' ? base + 8 : b.tag === 'h2' ? base + 4 : b.tag === 'h3' ? base + 2 : base;
      const f = b.tag.startsWith('h') ? fontB : font;
      const prefix = b.tag === 'li' ? '• ' : '';
      const words = (prefix + b.text).split(' ');
      let line = '';
      const emit = (ln) => {
        if (y < 60) newPage();
        page.drawText(ln, { x: 60, y, size, font: f });
        y -= size * 1.5;
      };
      for (const w of words) {
        const trial = line ? line + ' ' + w : w;
        if (f.widthOfTextAtSize(trial, size) > width - 120) { emit(line); line = w; }
        else line = trial;
      }
      if (line) emit(line);
      y -= size * 0.4;
    }
    const out = opts.output || path.basename(input, path.extname(input)) + '.pdf';
    await savePdf(doc, out);
    return `Converted -> ${out} (text layout; complex formatting needs LibreOffice — see README)`;
  },
};
