'use strict';
// iLovePDF: Protect PDF — password-encrypt a PDF.
const { fs, ensureDirFor, loadPdf } = require('../lib/util.cjs');

module.exports = {
  command: 'protect <input>',
  description: 'Password-protect / encrypt a PDF (iLovePDF: Protect PDF)',
  options: [
    ['-o, --output <path>', 'Output PDF path', 'protected.pdf'],
    ['--user-password <pw>', 'Password required to open the file', null],
    ['--owner-password <pw>', 'Owner password (defaults to user password)', null],
    ['--no-printing', 'Disallow printing'],
    ['--no-copying', 'Disallow text copying'],
    ['--no-modifying', 'Disallow modifying'],
  ],
  action: async (input, opts) => {
    const pw = opts.userPassword;
    if (!pw) throw new Error('Provide --user-password <pw>');
    const src = await loadPdf(input);
    const { PDFDocument } = require('pdf-lib');
    const out = await PDFDocument.create();
    (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
    const permissions = {};
    if (opts.printing === false) permissions.printing = 'lowResolution';
    if (opts.copying === false) permissions.copying = false;
    if (opts.modifying === false) permissions.modifying = false;
    ensureDirFor(opts.output);
    fs.writeFileSync(opts.output, await out.save({
      userPassword: pw,
      ownerPassword: opts.ownerPassword || pw,
      permissions,
    }));
    return `Encrypted -> ${opts.output}`;
  },
};
