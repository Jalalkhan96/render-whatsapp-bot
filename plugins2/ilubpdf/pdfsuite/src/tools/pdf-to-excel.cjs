'use strict';
// iLovePDF: PDF to Excel — pull table-like text into an XLSX spreadsheet.
const { fs, path, loadPdfjs, ensureDirFor } = require('../lib/util.cjs');
const XLSX = require('xlsx');

module.exports = {
  command: 'pdf-to-excel <input>',
  description: 'Extract PDF text into XLSX (iLovePDF: PDF to Excel)',
  options: [
    ['-o, --output <path>', 'Output XLSX path', null],
    ['--pages <spec>', 'Pages to convert (default: all)', null],
  ],
  action: async (input, opts) => {
    const doc = await loadPdfjs(input);
    let idx = [...Array(doc.numPages).keys()].map(i => i + 1);
    if (opts.pages) {
      const { parsePages } = require('../lib/util.cjs');
      idx = parsePages(opts.pages, doc.numPages).map(i => i + 1);
    }
    const wb = XLSX.utils.book_new();
    for (const p of idx) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      // Group items into rows by y, split into columns by x-gaps.
      const rows = new Map();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const key = Math.round(it.transform[5] / 4) * 4;
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push({ x: it.transform[4], str: it.str });
      }
      const aoa = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, items]) => {
        items.sort((a, b) => a.x - b.x);
        const cols = [];
        let cur = '';
        for (let i = 0; i < items.length; i++) {
          cur += (cur ? ' ' : '') + items[i].str;
          const gap = i + 1 < items.length ? items[i + 1].x - items[i].x : 0;
          if (gap > 25) { cols.push(cur); cur = ''; }
        }
        if (cur) cols.push(cur);
        return cols;
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), `Page ${p}`);
    }
    const out = opts.output || path.basename(input, path.extname(input)) + '.xlsx';
    ensureDirFor(out);
    XLSX.writeFile(wb, out);
    return `Converted ${idx.length} page(s) -> ${out}`;
  },
};
