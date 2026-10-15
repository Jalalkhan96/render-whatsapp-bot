'use strict';
// Extract all text from a PDF to a .txt file.
const { fs, path, loadPdfjs, pageLines, ensureDirFor } = require('../lib/util.cjs');

module.exports = {
  command: 'extract-text <input>',
  description: 'Extract all text to a .txt file',
  options: [
    ['-o, --output <path>', 'Output TXT path', null],
    ['--pages <spec>', 'Pages to extract (default: all)', null],
  ],
  action: async (input, opts) => {
    const doc = await loadPdfjs(input);
    let idx = [...Array(doc.numPages).keys()].map(i => i + 1);
    if (opts.pages) {
      const { parsePages } = require('../lib/util.cjs');
      idx = parsePages(opts.pages, doc.numPages).map(i => i + 1);
    }
    const parts = [];
    for (const p of idx) parts.push(`--- Page ${p} ---\n` + (await pageLines(doc, p)).join('\n'));
    const out = opts.output || path.basename(input, path.extname(input)) + '.txt';
    ensureDirFor(out);
    fs.writeFileSync(out, parts.join('\n\n'));
    return `Extracted ${idx.length} page(s) -> ${out}`;
  },
};
