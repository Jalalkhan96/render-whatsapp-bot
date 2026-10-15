'use strict';
// iLovePDF: PowerPoint to PDF — best-effort PPTX text -> PDF slides (see README).
const { fs, path, savePdf, standardFont, hexToRgb } = require('../lib/util.cjs');
const { PDFDocument } = require('pdf-lib');
const JSZip = require('jszip');

module.exports = {
  command: 'pptx-to-pdf <input>',
  description: 'Convert PPTX to PDF slides, text layout (iLovePDF: PowerPoint to PDF)',
  options: [['-o, --output <path>', 'Output PDF path', null]],
  action: async (input, opts) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(input));
    const slideFiles = Object.keys(zip.files)
      .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => parseInt(a.match(/(\d+)/)[1]) - parseInt(b.match(/(\d+)/)[1]));
    if (!slideFiles.length) throw new Error('No slides found in PPTX.');
    const doc = await PDFDocument.create();
    const font = await standardFont(doc), fontB = await standardFont(doc, 'helveticaBold');
    for (const sf of slideFiles) {
      const xml = await zip.files[sf].async('string');
      const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
      const page = doc.addPage([960, 540]);
      let y = 480;
      texts.forEach((t, i) => {
        const size = i === 0 ? 26 : 15, f = i === 0 ? fontB : font;
        const words = t.split(' '); let line = '';
        const emit = (ln) => { page.drawText(ln, { x: 60, y, size, font: f, color: hexToRgb('#222222') }); y -= size * 1.6; };
        for (const w of words) {
          const trial = line ? line + ' ' + w : w;
          if (f.widthOfTextAtSize(trial, size) > 840) { emit(line); line = w; } else line = trial;
        }
        if (line) emit(line);
        y -= 10;
        if (y < 40) y = 480; // overflow guard
      });
    }
    const out = opts.output || path.basename(input, path.extname(input)) + '.pdf';
    await savePdf(doc, out);
    return `Converted ${slideFiles.length} slide(s) -> ${out} (text layout; images/shapes not rendered — see README)`;
  },
};
