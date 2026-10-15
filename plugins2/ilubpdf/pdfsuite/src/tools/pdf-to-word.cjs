'use strict';
// iLovePDF: PDF to Word — extract text into an editable DOCX.
const { fs, path, loadPdfjs, pageLines, ensureDirFor } = require('../lib/util.cjs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

module.exports = {
  command: 'pdf-to-word <input>',
  description: 'Convert PDF to editable DOCX (iLovePDF: PDF to Word)',
  options: [
    ['-o, --output <path>', 'Output DOCX path', null],
    ['--pages <spec>', 'Pages to convert (default: all)', null],
  ],
  action: async (input, opts) => {
    const doc = await loadPdfjs(input);
    let idx = [...Array(doc.numPages).keys()].map(i => i + 1);
    if (opts.pages) {
      const { parsePages } = require('../lib/util.cjs');
      idx = parsePages(opts.pages, doc.numPages).map(i => i + 1);
    }
    const children = [];
    for (const p of idx) {
      const lines = await pageLines(doc, p);
      lines.forEach((line, li) => {
        const isHeading = li === 0 && line.length < 90 && line === line.toUpperCase() && /[A-Z]/.test(line);
        children.push(new Paragraph({
          heading: isHeading ? HeadingLevel.HEADING_2 : undefined,
          children: [new TextRun({ text: line, bold: isHeading })],
        }));
      });
      children.push(new Paragraph({ children: [] })); // page break-ish spacing
    }
    const out = opts.output || path.basename(input, path.extname(input)) + '.docx';
    ensureDirFor(out);
    fs.writeFileSync(out, await Packer.toBuffer(new Document({ sections: [{ children }] })));
    return `Converted ${idx.length} page(s) -> ${out}`;
  },
};
