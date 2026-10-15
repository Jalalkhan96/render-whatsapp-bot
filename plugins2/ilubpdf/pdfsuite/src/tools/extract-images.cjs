'use strict';
// Extract embedded raster images from a PDF (JPEG streams saved directly; others skipped).
const { fs, path, loadPdf, ensureDirFor, PDFName } = require('../lib/util.cjs');

module.exports = {
  command: 'extract-images <input>',
  description: 'Extract embedded images from a PDF',
  options: [['-o, --output <dir>', 'Output directory', 'images_out']],
  action: async (input, opts) => {
    const doc = await loadPdf(input);
    ensureDirFor(path.join(opts.output, 'x'));
    const base = path.basename(input, path.extname(input));
    let n = 0, skipped = 0;
    for (const page of doc.getPages()) {
      const res = page.node.Resources();
      if (!res) continue;
      const xobj = res.lookup(PDFName.of('XObject'));
      if (!xobj) continue;
      for (const [key, ref] of xobj.entries()) {
        const obj = doc.context.lookup(ref);
        if (!obj || obj.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue;
        const filter = obj.get(PDFName.of('Filter'));
        const filterName = Array.isArray(filter) ? filter[0]?.toString() : filter?.toString();
        try {
          const bytes = obj.getContents ? obj.getContents() : null;
          const stream = doc.context.lookup(ref);
          const raw = stream.contents ?? stream.getContents?.();
          if (filterName === '/DCTDecode' && raw) {
            n++;
            fs.writeFileSync(path.join(opts.output, `${base}-img${n}.jpg`), Buffer.from(raw));
          } else skipped++;
        } catch { skipped++; }
      }
    }
    return `Extracted ${n} JPEG image(s) -> ${opts.output}/ (${skipped} non-JPEG skipped)`;
  },
};
