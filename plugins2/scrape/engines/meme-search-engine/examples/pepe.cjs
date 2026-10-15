'use strict';

/**
 * examples/pepe.cjs — the Pepe the Frog demo.
 * Searches all three live sources for "pepe the frog" and prints the top 10.
 */
const { searchMemes } = require('../src/index.cjs');

(async () => {
  const hits = await searchMemes('pepe the frog', { limit: 25 });
  const meta = hits._meta;
  console.log(`\n${hits.length} results for "pepe the frog" (${meta.totalCandidates} candidates)\n`);
  hits.slice(0, 10).forEach((h, i) => {
    console.log(`${String(i + 1).padStart(2)}. [${h.score}] ${h.title}`);
    console.log(`    src=${h.source} license=${h.license.status}${h.license.name ? ' (' + h.license.name + ')' : ''} ups=${h.ups}`);
    console.log(`    ${h.imageUrl}`);
  });
  if (Object.keys(meta.errors).length) console.log('\nsource notes:', meta.errors);
  console.log('');
})().catch((e) => { console.error('demo failed:', e.message); process.exit(1); });
