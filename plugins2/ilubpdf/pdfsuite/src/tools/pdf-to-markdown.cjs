'use strict';
// iLovePDF: PDF to Markdown — headings, lists and links preserved heuristically.
const { fs, path, loadPdfjs, ensureDirFor } = require('../lib/util.cjs');

module.exports = {
  command: 'pdf-to-markdown <input>',
  description: 'Convert PDF to Markdown (iLovePDF: PDF to Markdown)',
  options: [
    ['-o, --output <path>', 'Output MD path', null],
    ['--pages <spec>', 'Pages to convert (default: all)', null],
  ],
  action: async (input, opts) => {
    const doc = await loadPdfjs(input);
    let idx = [...Array(doc.numPages).keys()].map(i => i + 1);
    if (opts.pages) {
      const { parsePages } = require('../lib/util.cjs');
      idx = parsePages(opts.pages, doc.numPages).map(i => i + 1);
    }
    const md = [`# ${path.basename(input, path.extname(input))}`, ''];
    for (const p of idx) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const rows = new Map();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const key = Math.round(it.transform[5] / 4) * 4;
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push({ x: it.transform[4], str: it.str, h: it.height || 10 });
      }
      const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]);
      const avgH = lines.length ? lines.reduce((s, [, it]) => s + Math.max(...it.map(i => i.h)), 0) / lines.length : 10;
      for (const [, items] of lines) {
        items.sort((a, b) => a.x - b.x);
        const text = items.map(i => i.str).join(' ').trim();
        if (!text) continue;
        const h = Math.max(...items.map(i => i.h));
        let line = text;
        if (/^([•·▪◦-]\s|\d+[.)]\s)/.test(text)) line = '- ' + text.replace(/^([•·▪◦-]\s|\d+[.)]\s)/, '');
        else if (h > avgH * 1.35 && text.length < 120) line = '## ' + text;
        else if (h > avgH * 1.15 && text.length < 160) line = '### ' + text;
        md.push(line, '');
      }
    }
    const out = opts.output || path.basename(input, path.extname(input)) + '.md';
    ensureDirFor(out);
    fs.writeFileSync(out, md.join('\n'));
    return `Converted ${idx.length} page(s) -> ${out}`;
  },
};
