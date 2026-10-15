'use strict';

/**
 * examples/anime-sounds.cjs — anime meme sound demo.
 */
const { searchSounds } = require('../src/index.cjs');

(async () => {
  const hits = await searchSounds('anime meme sound effect', { limit: 15 });
  const meta = hits._meta || {};
  console.log(`\n${hits.length} results for "anime meme sound effect"\n`);
  hits.forEach((h, i) => {
    console.log(`${String(i + 1).padStart(2)}. [${h.score}] ${h.title}`);
    console.log(`    src=${h.source} kind=${h.kind} license=${h.license.status}` +
      (h.durationSec != null ? ` dur=${h.durationSec}s` : '') +
      (h.views ? ` views=${h.views}` : ''));
    console.log(`    ${h.downloadable ? h.mediaUrl : h.pageUrl}`);
  });
  if (meta.errors && Object.keys(meta.errors).length) console.log('\nsource notes:', meta.errors);
  console.log('');
})().catch((e) => { console.error('demo failed:', e.message); process.exit(1); });
