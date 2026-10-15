'use strict';
/**
 * Adapter test runner — one source at a time, small limits, no media downloads.
 * Prints compact lines:  [3/64] genius OK (3 results, 812ms)
 * Writes tests/test-results.json. Failing sources never crash the run.
 *
 *   node tests/run.js            # all adapters
 *   node tests/run.js genius     # single adapter
 */
const fs = require('fs');
const path = require('path');
const registry = require('../music/source-registry');
const logger = require('../music/logger');

const TEST_QUERIES = {
  lyrics: 'Blinding Lights The Weeknd',
  metadata: 'Blinding Lights',
  'regional-platforms': 'Pasoori',
  regional: 'Pasoori',
  charts: 'US',
  info: 'Blinding Lights',
  translation: 'Blinding Lights',
  recognition: null, // health-only; no keys expected
};

async function testOne(entry, index, total) {
  const a = entry.adapter;
  const type = entry.META.type || entry.dir;
  const label = entry.id;
  if (!a) {
    logger.progress(index, total, label, 'DISABLED', '(no adapter)');
    return { id: entry.id, status: 'disabled', note: entry.loadError || 'no adapter' };
  }
  const started = Date.now();
  try {
    if (type === 'charts' && a.charts) {
      const r = await a.charts('US', { limit: 5 });
      const ms = Date.now() - started;
      const items = r.results || r.entries || [];
      logger.progress(index, total, label, String(r.status).toUpperCase(), '(' + items.length + ' entries, ' + ms + 'ms)');
      return { id: entry.id, status: r.status, note: r.note || '', resultCount: items.length, ms };
    }
    if (type === 'recognition') {
      const h = a.health ? await a.health() : { status: 'healthy' };
      const ms = Date.now() - started;
      logger.progress(index, total, label, String(h.status).toUpperCase(), '(health check, ' + ms + 'ms)');
      return { id: entry.id, status: h.status === 'healthy' ? 'auth_required' : h.status, note: h.note || 'recognition needs provider keys', ms };
    }
    if (type === 'regional' || !a.search) {
      const h = a.health ? await a.health() : { status: 'healthy' };
      const ms = Date.now() - started;
      logger.progress(index, total, label, String(h.status).toUpperCase(), '(strategy/health, ' + ms + 'ms)');
      return { id: entry.id, status: h.status === 'healthy' ? 'ok' : h.status, note: h.note || '', ms };
    }
    const q = TEST_QUERIES[type] || TEST_QUERIES.metadata;
    const r = await a.search(q, { limit: 3 });
    const ms = Date.now() - started;
    const n = (r.results || []).length;
    logger.progress(index, total, label, String(r.status).toUpperCase(), '(' + n + ' results, ' + ms + 'ms)');
    return { id: entry.id, status: r.status, note: r.note || '', resultCount: n, testQuery: q, ms };
  } catch (err) {
    const ms = Date.now() - started;
    logger.progress(index, total, label, 'ERROR', '(' + ms + 'ms)');
    logger.error(label, err);
    return { id: entry.id, status: 'error', note: String((err && err.message) || err).slice(0, 200), ms };
  }
}

async function main() {
  const only = process.argv[2];
  const list = registry.registry.filter((e) => !only || e.id === only);
  if (!list.length) { console.error('no such adapter: ' + only); process.exit(1); }
  const results = [];
  let i = 0;
  for (const e of list) {
    i++;
    results.push(await testOne(e, i, list.length));
    // release between sources
    if (global.gc) { try { global.gc(); } catch (err) { /* ignore */ } }
  }
  const out = { at: new Date().toISOString(), results };
  const file = path.join(__dirname, 'test-results.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  const byStatus = {};
  for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  console.log('\nSummary:', JSON.stringify(byStatus));
  console.log('Wrote', file);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { testOne };
