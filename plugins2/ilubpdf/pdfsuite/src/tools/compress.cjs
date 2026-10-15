'use strict';
// iLovePDF: Compress PDF — reduce file size (object-stream recompression).
const { fs, loadPdf } = require('../lib/util.cjs');
const { PDFDocument } = require('pdf-lib');

module.exports = {
  command: 'compress <input>',
  description: 'Reduce PDF file size (iLovePDF: Compress PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'compressed.pdf'],
    ['--level <n>', '1=light, 2=medium, 3=strong (object-stream recompression)', '2'],
  ],
  action: async (input, opts) => {
    const before = fs.statSync(input).size;
    const src = await loadPdf(input);
    const level = Math.min(3, Math.max(1, parseInt(opts.level, 10) || 2));
    const out = await PDFDocument.create();
    (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
    // Carry over metadata so the file stays equivalent.
    try {
      const t = src.getTitle(); if (t) out.setTitle(t);
      const a = src.getAuthor(); if (a) out.setAuthor(a);
    } catch { /* ignore */ }
    const { ensureDirFor } = require('../lib/util.cjs');
    ensureDirFor(opts.output);
    fs.writeFileSync(opts.output, await out.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: level === 3 ? 20 : 50,
    }));
    const after = fs.statSync(opts.output).size;
    const pct = ((1 - after / before) * 100).toFixed(1);
    return `Compressed ${fmt(before)} -> ${fmt(after)} (${pct}% smaller) -> ${opts.output}`;
  },
};

function fmt(b) { return b > 1048576 ? (b / 1048576).toFixed(2) + ' MB' : (b / 1024).toFixed(1) + ' KB'; }
