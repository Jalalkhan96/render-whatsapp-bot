'use strict';
/* Generic per-site test (MASTER PROMPT §36, §37).
 * Small sample: latest({limit:3}). Statuses:
 *   passed   — adapter valid, HTTP OK, >=1 normalized record
 *   degraded — site blocked/empty/paywalled BUT adapter is truthful
 *              (provider-required, or clean empty result with reason)
 *   failed   — code bug (bad shape, throw on load, TypeError, fabricated data)
 */
const registry = require('../lib/registry.cjs');
const { validateAdapter } = require('../lib/base.cjs');

function looksLikeRecord(r) {
  if (!r || typeof r !== 'object') return false;
  if (!r.source) return false;
  // news/social: title+url; finance: symbol; product: title+url; sports: title
  return !!(r.title || r.symbol);
}

function isSiteProblem(err) {
  const m = (err && err.message || String(err)).toLowerCase();
  return /timeout|timed out|abort|econn|enotfound|eai_again|socket hang up|403|401|429|blocked|denied|captcha|challenge|cloudflare|login|paywall|too large|fetch failed/i.test(m);
}

async function runSiteTest(id) {
  const t0 = Date.now();
  const out = { id, status: 'failed', records: 0, ms: 0, note: '' };
  try {
    const { adapter } = registry.getAdapter(id);
    validateAdapter(adapter, id);
    if (adapter.transport === 'provider-required') {
      out.status = 'degraded';
      out.note = 'provider-required: ' + (adapter.providerRequiredReason || 'no reason given');
      out.ms = Date.now() - t0;
      return out;
    }
    const res = await adapter.latest({ limit: 3 });
    if (res && res.supported === false) {
      out.status = 'degraded';
      out.note = 'latest() unsupported: ' + (res.reason || '');
    } else if (Array.isArray(res) && res.length > 0 && res.every(looksLikeRecord)) {
      out.status = 'passed';
      out.records = res.length;
      out.note = `transport=${adapter.transport}`;
    } else if (Array.isArray(res) && res.length === 0) {
      out.status = 'degraded';
      out.note = '0 records (empty result, no exception)';
    } else {
      out.status = 'failed';
      out.note = 'latest() returned malformed data';
    }
  } catch (err) {
    if (isSiteProblem(err)) {
      out.status = 'degraded';
      out.note = 'site problem: ' + String(err.message).slice(0, 140);
    } else {
      out.status = 'failed';
      out.note = 'code bug: ' + String(err.message).slice(0, 200);
    }
  }
  out.ms = Date.now() - t0;
  return out;
}

// Standalone: node tests/sites/<id>.cjs  (id derived from filename)
if (require.main === module) {
  const path = require('path');
  const id = path.basename(process.argv[1] || '', '.cjs');
  runSiteTest(id).then(r => {
    console.log(`${r.id}: ${r.status.toUpperCase()} records=${r.records} ${r.ms}ms — ${r.note}`);
    process.exit(r.status === 'failed' ? 1 : 0);
  });
}

module.exports = { runSiteTest, looksLikeRecord };
