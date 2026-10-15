'use strict';
// iLovePDF: Translate PDF — provider hook. Offline translation is out of scope;
// plug any translation API via TRANSLATE_ENDPOINT (POST {text,target} -> {text}).
const { fs, path, loadPdfjs, pageLines, ensureDirFor } = require('../lib/util.cjs');

module.exports = {
  command: 'translate <input>',
  description: 'Translate PDF text via a provider hook (iLovePDF: Translate PDF)',
  options: [
    ['-o, --output <path>', 'Output TXT path', 'translated.txt'],
    ['--to <lang>', 'Target language code, e.g. ur, es, fr', 'ur'],
    ['--pages <spec>', 'Pages to translate (default: all)', null],
  ],
  action: async (input, opts) => {
    const endpoint = process.env.TRANSLATE_ENDPOINT;
    if (!endpoint) {
      throw new Error(
        'Translation needs a provider. Set TRANSLATE_ENDPOINT to an HTTP endpoint that accepts ' +
        'POST {text, target} and returns {text} (see README "Translate PDF" for a 10-line example server).'
      );
    }
    const doc = await loadPdfjs(input);
    let idx = [...Array(doc.numPages).keys()].map(i => i + 1);
    if (opts.pages) {
      const { parsePages } = require('../lib/util.cjs');
      idx = parsePages(opts.pages, doc.numPages).map(i => i + 1);
    }
    const out = [];
    for (const p of idx) {
      const lines = await pageLines(doc, p);
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: lines.join('\n'), target: opts.to }),
      });
      if (!res.ok) throw new Error(`Translate endpoint failed: HTTP ${res.status}`);
      const { text } = await res.json();
      out.push(`--- Page ${p} ---\n${text}`);
    }
    ensureDirFor(opts.output);
    fs.writeFileSync(opts.output, out.join('\n\n'));
    return `Translated ${idx.length} page(s) -> ${opts.output}`;
  },
};
