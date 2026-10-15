'use strict';
// Smoke test: exercises the core tools end-to-end on generated PDFs.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const ROOT = path.join(__dirname, '..');
const T = path.join(ROOT, '.smoke');
const pdfsuite = require('../src/index.cjs');

async function makePdf(name, pages, label) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`${label} - page ${i + 1} of ${pages}`, { x: 60, y: 750, size: 20, font });
    p.drawText('The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.', { x: 60, y: 700, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
  }
  const f = path.join(T, name);
  fs.writeFileSync(f, await doc.save());
  return f;
}

(async () => {
  fs.rmSync(T, { recursive: true, force: true });
  fs.mkdirSync(T, { recursive: true });
  const a = await makePdf('a.pdf', 3, 'Alpha');
  const b = await makePdf('b.pdf', 2, 'Beta');

  const run = async (tool, args, opts = {}) => {
    const msg = await pdfsuite[tool].action(...args, opts);
    console.log('ok', tool, '-', msg.split('\n')[0]);
  };
  const out = (n) => path.join(T, n);

  await run('merge', [[a, b]], { output: out('merged.pdf') });
  await run('split', [out('merged.pdf')], { output: path.join(T, 'parts'), prefix: 'p' });
  await run('organize', [a], { output: out('org.pdf'), order: '3,1-2' });
  await run('rotate', [a], { output: out('rot.pdf'), angle: '90' });
  await run('watermark', [a], { output: out('wm.pdf'), text: 'DRAFT' });
  await run('pagenumbers', [a], { output: out('num.pdf'), format: 'Page {n} of {total}' });
  await run('crop', [a], { output: out('crop.pdf'), margin: '36' });
  await run('redact', [a], { output: out('red.pdf'), find: 'quick brown' });
  await run('protect', [a], { output: out('prot.pdf'), userPassword: 'secret123' });
  await run('unlock', [out('prot.pdf')], { output: out('unlocked.pdf'), password: 'secret123' });
  await run('compress', [a], { output: out('comp.pdf') });
  await run('repair', [a], { output: out('rep.pdf') });
  await run('extract-text', [a], { output: out('a.txt') });
  await run('pdf-to-markdown', [a], { output: out('a.md') });
  await run('pdf-to-word', [a], { output: out('a.docx') });
  await run('pdf-to-excel', [a], { output: out('a.xlsx') });
  await run('pdf-to-pptx', [a], { output: out('a.pptx') });
  await run('pdf-to-pdfa', [a], { output: out('a-arch.pdf'), title: 'Smoke' });
  await run('compare', [a, b], { output: out('diff.md') });
  await run('summarize', [a], { output: out('sum.md') });
  await run('word-to-pdf', [out('a.docx')], { output: out('a2.pdf') });
  await run('excel-to-pdf', [out('a.xlsx')], { output: out('x2.pdf') });
  await run('pptx-to-pdf', [out('a.pptx')], { output: out('s2.pdf') });
  await run('pdf-to-jpg', [a], { output: path.join(T, 'imgs'), format: 'jpg', scale: '1', pages: '1' });
  await run('jpg-to-pdf', [[path.join(T, 'imgs', 'a-p1.jpg')]], { output: out('img.pdf') });
  await run('forms', [a, null], {});
  // workflow: chain compress -> watermark
  fs.writeFileSync(out('wf.json'), JSON.stringify({ steps: [
    { tool: 'compress', input: a, output: out('wf1.pdf') },
    { tool: 'watermark', input: out('wf1.pdf'), output: out('wf2.pdf'), options: { text: 'WF' } },
  ]}));
  await run('workflow', [out('wf.json')], {});

  // sanity: every output exists and is non-empty
  for (const f of fs.readdirSync(T, { recursive: true })) {
    const fp = path.join(T, f);
    if (fs.statSync(fp).isFile() && !f.endsWith('.json')) assert(fs.statSync(fp).size > 0, 'empty: ' + f);
  }
  console.log('\nSMOKE TEST PASSED —', fs.readdirSync(T, { recursive: true }).length, 'files produced');
})().catch(e => { console.error('SMOKE FAILED:', e); process.exit(1); });
