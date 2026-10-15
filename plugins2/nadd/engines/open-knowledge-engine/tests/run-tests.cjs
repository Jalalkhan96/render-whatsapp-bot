/*
 * tests/run-tests.cjs — per-source test harness (§99).
 *
 * Each test: connect / search / parse / normalize / license / pagination /
 * dedup / cleanup.
 * Implemented sources run ONE small live query. Stubs assert declared status.
 *
 * Usage: node tests/run-tests.cjs [--source <id>] [--limit <n>] [--json]
 *        node tests/run-tests.cjs --all
 */
'use strict';

const { makeRegistry } = require('../core/registry.cjs');
const { dedupe } = require('../core/deduplicator.cjs');
const { rankResults } = require('../core/result-ranker.cjs');
const { attachLicense } = require('../core/license-engine.cjs');
const { universalResult } = require('../core/base-source.cjs');

const ENGINE_ROOT = require('path').join(__dirname, '..');

function check(cond, label, notes) {
  return { ok: !!cond, label, notes: notes || null };
}

async function testSource(registry, id) {
  // Watchdog: no single source may hang the suite (§45). If the adapter's
  // own timeouts/retries stall (e.g. hostile network), fail fast instead.
  const WATCHDOG_MS = 90000;
  return Promise.race([
    _testSourceInner(registry, id),
    new Promise((resolve) => setTimeout(() => resolve({
      id, status: 'fail', stub: false,
      checks: [check(false, 'completed within 90s watchdog', 'adapter hung past its own timeouts')],
    }), WATCHDOG_MS)),
  ]);
}

async function _testSourceInner(registry, id) {
  const results = [];
  const meta = registry.get(id);
  if (!meta) return { id, status: 'fail', checks: [check(false, 'registry entry exists')] };

  results.push(check(typeof meta.name === 'string' && meta.name.length > 0, 'meta.name present'));
  results.push(check(typeof meta.category === 'string', 'meta.category present'));
  results.push(check(['api', 'dump', 'feed', 'html', 'stub'].includes(meta.transport), 'meta.transport valid'));
  const rawEntry = registry.raw(id);
  results.push(check(!!(rawEntry && typeof rawEntry.module.createSource === 'function'), 'createSource exported'));

  if (!meta.implemented) {
    // Honest stub: search() must return [] and healthCheck() must report declared status.
    try {
      const inst = registry.instantiate(id, {});
      const h = await inst.healthCheck();
      results.push(check(h && h.status === meta.status, 'stub healthCheck reports declared status', `got ${h && h.status}, declared ${meta.status}`));
      const rs = await inst.search('test', { limit: 2 });
      results.push(check(Array.isArray(rs) && rs.length === 0, 'stub search returns [] (no fabrication)'));
    } catch (err) {
      results.push(check(false, 'stub instantiate/search', String(err.message).slice(0, 160)));
    }
    const passed = results.filter((r) => r.ok).length;
    return { id, status: passed === results.length ? 'pass' : 'fail', checks: results, stub: true };
  }

  // Implemented: one small live query.
  const t0 = Date.now();
  try {
    const inst = registry.instantiate(id, {});
    const h = await inst.healthCheck();
    results.push(check(h && typeof h.status === 'string', 'healthCheck returns status', `status=${h && h.status}`));

    let rows = [];
    try {
      rows = await inst.search('test', { limit: 3 });
      results.push(check(Array.isArray(rows), 'search returns array', `${rows.length} rows`));
    } catch (err) {
      results.push(check(false, 'search executes', String(err.message).slice(0, 160)));
    }
    results.push(check(rows.length <= 3, 'pagination respected (limit)'));

    if (rows.length) {
      const r = rows[0];
      const keys = ['id', 'source', 'sourceId', 'sourceUrl', 'title', 'description', 'type', 'creator', 'date',
        'language', 'country', 'contentUrl', 'thumbnailUrl', 'license', 'licenseUrl', 'rights',
        'identifiers', 'tags', 'categories', 'coordinates', 'metadata', 'retrievedAt'];
      const missing = keys.filter((k) => !(k in r));
      results.push(check(missing.length === 0, 'universal result format (§7)', missing.length ? `missing: ${missing.join(',')}` : null));
      results.push(check(r.source === id, 'result.source matches adapter id'));
      results.push(check(typeof r.license === 'string', 'license field present', `license=${r.license}`));
      results.push(check(r.license !== 'free' || (r.licenseUrl || '').length > 0, 'never fabricates free (unknown stays unknown)'));
      // license engine + dedup + rank smoke tests
      const licensed = attachLicense(r);
      results.push(check(licensed.licenseInfo && typeof licensed.licenseInfo.commercialUse !== 'undefined', 'license-engine evaluates asset'));
      const { results: u, duplicatesRemoved } = dedupe(rows.concat(rows));
      results.push(check(u.length === rows.length && duplicatesRemoved === rows.length, 'deduplicator removes exact duplicates'));
      const ranked = rankResults(rows, 'test', {});
      results.push(check(Array.isArray(ranked), 'ranker returns array'));
      const uni = universalResult({});
      results.push(check(uni.license === 'unknown' && uni.title === null, 'noFabrication: missing -> null/unknown'));
    }
    results.push(check(Date.now() - t0 < 60000, 'test completed within 60s'));
  } catch (err) {
    results.push(check(false, 'adapter lifecycle', String(err.message).slice(0, 160)));
  }

  const passed = results.filter((r) => r.ok).length;
  return { id, status: passed === results.length ? 'pass' : 'fail', checks: results, stub: false, ms: Date.now() - t0 };
}

function printSummary(outcomes, asJson) {
  const pass = outcomes.filter((o) => o.status === 'pass').length;
  const fail = outcomes.filter((o) => o.status === 'fail').length;
  const stubs = outcomes.filter((o) => o.stub).length;
  if (asJson) {
    console.log(JSON.stringify({ total: outcomes.length, pass, fail, stubs, outcomes }, null, 2));
    return;
  }
  console.log('\n==== OPEN KNOWLEDGE ENGINE — SOURCE TESTS ====');
  console.log(`Total: ${outcomes.length} | Passed: ${pass} | Failed: ${fail} | Stubs: ${stubs}\n`);
  for (const o of outcomes) {
    const icon = o.status === 'pass' ? '✅' : '❌';
    console.log(`${icon} ${o.id}${o.stub ? ' (stub)' : ''} — ${o.status}${o.ms != null ? ` (${o.ms}ms)` : ''}`);
    for (const c of o.checks) {
      if (!c.ok) console.log(`    ✗ ${c.label}${c.notes ? ` — ${c.notes}` : ''}`);
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const registry = makeRegistry(ENGINE_ROOT);
  if (registry.errors.length) {
    console.error('REGISTRY LOAD ERRORS:');
    for (const e of registry.errors) console.error(`  ${e.file}: ${e.error}`);
  }
  let ids;
  const si = argv.indexOf('--source');
  if (si !== -1 && argv[si + 1]) ids = [argv[si + 1]];
  else if (argv.includes('--all')) ids = registry.files.map((f) => f.split('/').pop().replace(/\.cjs$/, ''));
  else ids = registry.files.map((f) => f.split('/').pop().replace(/\.cjs$/, ''));

  const outcomes = [];
  for (const id of ids) {
    // Sequential — never 100 simultaneous (§101).
    // eslint-disable-next-line no-await-in-loop
    const o = await testSource(registry, id);
    outcomes.push(o);
    if (!asJson) console.log(`[${outcomes.length}/${ids.length}] ${o.id}: ${o.status}`);
  }
  printSummary(outcomes, asJson);
  process.exit(outcomes.some((o) => o.status === 'fail') ? 1 : 0);
}

main().catch((e) => { console.error('test harness error:', e.message); process.exit(2); });
