'use strict';
// iLovePDF: PDF to JPG — render each page to an image.
const { fs, path, loadPdfjs, renderPagePng, ensureDirFor } = require('../lib/util.cjs');

module.exports = {
  command: 'pdf-to-jpg <input>',
  description: 'Render each PDF page to JPG/PNG (iLovePDF: PDF to JPG)',
  options: [
    ['-o, --output <dir>', 'Output directory', 'pages_out'],
    ['--format <f>', 'jpg or png', 'jpg'],
    ['--scale <n>', 'Render scale (2 ≈ 144dpi)', '2'],
    ['--pages <spec>', 'Pages to render, e.g. "1-3" (default: all)', null],
  ],
  action: async (input, opts) => {
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const doc = await loadPdfjs(input);
    ensureDirFor(path.join(opts.output, 'x'));
    const base = path.basename(input, path.extname(input));
    let idx = [...Array(doc.numPages).keys()].map(i => i + 1);
    if (opts.pages) {
      const { parsePages } = require('../lib/util.cjs');
      idx = parsePages(opts.pages, doc.numPages).map(i => i + 1);
    }
    const fmt = (opts.format || 'jpg').toLowerCase();
    for (const p of idx) {
      const png = await renderPagePng(await doc.getPage(p), parseFloat(opts.scale));
      let buf = png, ext = 'png';
      if (fmt === 'jpg' || fmt === 'jpeg') {
        const img = await loadImage(png);
        const c = createCanvas(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        buf = c.toBuffer('image/jpeg', 90); ext = 'jpg';
      }
      fs.writeFileSync(path.join(opts.output, `${base}-p${p}.${ext}`), buf);
    }
    return `Rendered ${idx.length} page(s) -> ${opts.output}/`;
  },
};
