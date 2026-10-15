'use strict';
// iLovePDF: PDF to PDF/A — normalization pass (metadata + clean resave).
// NOTE: true PDF/A requires an sRGB OutputIntent and fully embedded fonts;
// this tool performs the achievable normalization and flags what remains.
const { fs, loadPdf, savePdf } = require('../lib/util.cjs');
const { PDFDocument } = require('pdf-lib');

module.exports = {
  command: 'pdf-to-pdfa <input>',
  description: 'Normalize a PDF toward PDF/A archival form (iLovePDF: PDF to PDF/A)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'archival.pdf'],
    ['--title <t>', 'Document title metadata', null],
    ['--author <t>', 'Document author metadata', null],
  ],
  action: async (input, opts) => {
    const src = await loadPdf(input);
    const out = await PDFDocument.create();
    (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
    out.setProducer('pdfsuite-node');
    out.setCreator('pdfsuite-node pdf-to-pdfa');
    if (opts.title) out.setTitle(opts.title);
    if (opts.author) out.setAuthor(opts.author);
    out.setCreationDate(new Date());
    out.setModificationDate(new Date());
    await savePdf(out, opts.output);
    return `Normalized -> ${opts.output}. NOTE: full PDF/A-1b validation (embedded fonts, sRGB OutputIntent) ` +
      `needs a validator like veraPDF — see README.`;
  },
};
