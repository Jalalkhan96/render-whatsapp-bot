'use strict';
// iLovePDF: Compare PDF — side-by-side text comparison, spot the differences.
const { fs, path, loadPdfjs, pageLines, ensureDirFor } = require('../lib/util.cjs');

function diffLines(a, b) {
  // Simple LCS-based diff.
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(`- ${a[i++]}`);
    else out.push(`+ ${b[j++]}`);
  }
  while (i < m) out.push(`- ${a[i++]}`);
  while (j < n) out.push(`+ ${b[j++]}`);
  return out;
}

module.exports = {
  command: 'compare <old> <new>',
  description: 'Compare two PDFs textually (iLovePDF: Compare PDF)',
  options: [['-o, --output <path>', 'Diff report path (.md)', 'diff-report.md']],
  action: async (oldP, newP, opts) => {
    const [d1, d2] = [await loadPdfjs(oldP), await loadPdfjs(newP)];
    const pages = Math.max(d1.numPages, d2.numPages);
    const report = [`# PDF comparison`, ``, `Old: ${oldP} (${d1.numPages} pages)`, `New: ${newP} (${d2.numPages} pages)`, ''];
    let changed = 0;
    for (let p = 1; p <= pages; p++) {
      const l1 = p <= d1.numPages ? await pageLines(d1, p) : [];
      const l2 = p <= d2.numPages ? await pageLines(d2, p) : [];
      const d = diffLines(l1, l2);
      if (d.length) {
        changed++;
        report.push(`## Page ${p} (${d.length} changed line(s))`, '', '```diff', ...d.slice(0, 200), '```', '');
      }
    }
    report.push(changed ? `Pages with differences: ${changed}/${pages}` : 'Documents are textually identical.');
    ensureDirFor(opts.output);
    fs.writeFileSync(opts.output, report.join('\n'));
    return `Compared ${pages} page(s): ${changed} differ -> ${opts.output}`;
  },
};
