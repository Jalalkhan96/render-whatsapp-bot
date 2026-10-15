'use strict';
// iLovePDF: Unlock PDF — remove password security when you know the password.
const { fs, savePdf } = require('../lib/util.cjs');
const { PDFDocument } = require('pdf-lib');

module.exports = {
  command: 'unlock <input>',
  description: 'Remove PDF password (you must know it) (iLovePDF: Unlock PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'unlocked.pdf'],
    ['--password <pw>', 'Current password of the PDF', null],
  ],
  action: async (input, opts) => {
    if (!opts.password) throw new Error('Provide --password <pw> (the current password)');
    const doc = await PDFDocument.load(fs.readFileSync(input), { password: opts.password });
    await savePdf(doc, opts.output); // re-saved with no password
    return `Unlocked -> ${opts.output}`;
  },
};
