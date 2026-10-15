'use strict';
// iLovePDF: Excel to PDF — render spreadsheets as PDF tables.
const { path, savePdf, standardFont, hexToRgb } = require('../lib/util.cjs');
const { PDFDocument } = require('pdf-lib');
const XLSX = require('xlsx');

module.exports = {
  command: 'excel-to-pdf <input>',
  description: 'Convert XLSX sheets to PDF tables (iLovePDF: Excel to PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', null],
    ['--sheet <name>', 'Single sheet name (default: all sheets)', null],
    ['--orientation <o>', 'portrait|landscape', 'landscape'],
  ],
  action: async (input, opts) => {
    const wb = XLSX.readFile(input);
    const names = opts.sheet ? [opts.sheet] : wb.SheetNames;
    const doc = await PDFDocument.create();
    const font = await standardFont(doc), fontB = await standardFont(doc, 'helveticaBold');
    for (const name of names) {
      const ws = wb.Sheets[name];
      if (!ws) throw new Error(`Sheet "${name}" not found`);
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!aoa.length) continue;
      const cols = Math.max(...aoa.map(r => r.length));
      const landscape = opts.orientation !== 'portrait';
      let page = doc.addPage(landscape ? [842, 595] : [595, 842]);
      let { width, height } = page.getSize();
      const m = 40, cw = (width - m * 2) / cols, rh = 20;
      let y = height - m;
      const newPage = () => { page = doc.addPage(landscape ? [842, 595] : [595, 842]); ({ width, height } = page.getSize()); y = height - m; };
      page.drawText(name, { x: m, y: y - 14, size: 13, font: fontB }); y -= 30;
      aoa.forEach((row, ri) => {
        if (y - rh < m) newPage();
        for (let ci = 0; ci < cols; ci++) {
          const x = m + ci * cw;
          page.drawRectangle({ x, y: y - rh, width: cw, height: rh, borderColor: hexToRgb('#999999'), borderWidth: 0.5, color: ri === 0 ? hexToRgb('#eeeeee') : undefined });
          let txt = String(row[ci] ?? '');
          const f = ri === 0 ? fontB : font;
          while (txt && f.widthOfTextAtSize(txt, 9) > cw - 8) txt = txt.slice(0, -1);
          page.drawText(txt, { x: x + 4, y: y - rh + 6, size: 9, font: f });
        }
        y -= rh;
      });
    }
    const out = opts.output || path.basename(input, path.extname(input)) + '.pdf';
    await savePdf(doc, out);
    return `Converted ${names.length} sheet(s) -> ${out}`;
  },
};
