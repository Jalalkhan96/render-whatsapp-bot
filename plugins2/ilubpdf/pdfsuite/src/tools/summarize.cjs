'use strict';
// iLovePDF: AI Summarizer — offline extractive summarizer (no API key needed).
const { fs, path, loadPdfjs, pageLines, ensureDirFor } = require('../lib/util.cjs');

const STOP = new Set(('a,an,the,and,or,but,if,then,else,when,while,of,at,by,for,with,about,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,once,here,there,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,own,same,so,than,too,very,can,will,just,don,should,now,is,are,was,were,be,been,being,have,has,had,having,do,does,did,doing,would,could,ought,i,you,he,she,it,we,they,them,his,her,its,our,their,this,that,these,those,as').split(','));

module.exports = {
  command: 'summarize <input>',
  description: 'Extractive summary of a PDF (iLovePDF: AI Summarizer, offline)',
  options: [
    ['-o, --output <path>', 'Summary output (.md)', 'summary.md'],
    ['--sentences <n>', 'Number of sentences', '8'],
  ],
  action: async (input, opts) => {
    const doc = await loadPdfjs(input);
    const text = [];
    for (let p = 1; p <= doc.numPages; p++) text.push(...await pageLines(doc, p));
    const full = text.join(' ');
    const sentences = full.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()).filter(s => s.split(' ').length > 4) || [];
    if (!sentences.length) throw new Error('No sentences found to summarize.');
    const freq = {};
    for (const w of full.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/))
      if (w.length > 3 && !STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
    const scored = sentences.map((s, i) => {
      const words = s.toLowerCase().split(/\s+/);
      const score = words.reduce((t, w) => t + (freq[w] || 0), 0) / Math.sqrt(words.length);
      return { s, i, score };
    });
    const k = Math.min(parseInt(opts.sentences, 10), sentences.length);
    const top = scored.sort((a, b) => b.score - a.score).slice(0, k).sort((a, b) => a.i - b.i);
    const md = [`# Summary — ${path.basename(input)}`, '', ...top.map(t => `- ${t.s}`), ''];
    ensureDirFor(opts.output);
    fs.writeFileSync(opts.output, md.join('\n'));
    return `Summarized ${sentences.length} sentences -> top ${k} in ${opts.output}`;
  },
};
