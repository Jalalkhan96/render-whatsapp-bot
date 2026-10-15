'use strict';
// iLovePDF: HTML to PDF — simple semantic HTML -> PDF (best effort; see README).
const { fs, path, savePdf, standardFont, hexToRgb } = require('../lib/util.cjs');
const { PDFDocument } = require('pdf-lib');

module.exports = {
  command: 'html-to-pdf <input>',
  description: 'Convert an HTML file to PDF (iLovePDF: HTML to PDF)',
  options: [['-o, --output <path>', 'Output PDF path', null]],
  action: async (input, opts) => {
    let html = fs.readFileSync(input, 'utf8');
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    const blocks = [];
    const re = /<(h[1-3]|p|li|blockquote|pre)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(html))) {
      let text = m[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
      text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
      if (text) blocks.push({ tag: m[1].toLowerCase(), text });
    }
    if (!blocks.length) {
      const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (t) blocks.push({ tag: 'p', text: t });
    }
    if (!blocks.length) throw new Error('No readable content found in HTML.');
    const doc = await PDFDocument.create();
    const font = await standardFont(doc), fontB = await standardFont(doc, 'helveticaBold'), fontI = await standardFont(doc, 'helvetica');
    let page = doc.addPage(), { width, height } = page.getSize(), y = height - 60;
    const newPage = () => { page = doc.addPage(); ({ width, height } = page.getSize()); y = height - 60; };
    for (const b of blocks) {
      const size = b.tag === 'h1' ? 22 : b.tag === 'h2' ? 18 : b.tag === 'h3' ? 15 : 11;
      const f = b.tag.startsWith('h') ? fontB : font;
      const color = b.tag === 'blockquote' ? hexToRgb('#555555') : hexToRgb('#111111');
      const prefix = b.tag === 'li' ? '• ' : b.tag === 'blockquote' ? '│ ' : '';
      const words = (prefix + b.text).split(' '); let line = '';
      const emit = (ln) => { if (y < 60) newPage(); page.drawText(ln, { x: 60, y, size, font: f, color }); y -= size * 1.55; };
      for (const w of words) {
        const trial = line ? line + ' ' + w : w;
        if (f.widthOfTextAtSize(trial, size) > width - 120) { emit(line); line = w; } else line = trial;
      }
      if (line) emit(line);
      y -= size * 0.5;
    }
    const out = opts.output || path.basename(input, path.extname(input)) + '.pdf';
    await savePdf(doc, out);
    return `Converted -> ${out} (semantic layout; for pixel-perfect rendering use headless Chrome — see README)`;
  },
};
