'use strict';
/* License engine. Every result must carry its provenance.
 * Rule, same as the other engines: unknown license NEVER becomes free.
 * Here that means: registry sources only, official links only,
 * no bulk downloading, no redistribution beyond linking the official page. */

const registry = require('./registry.cjs');

function attach(result) {
  const src = registry.get(result.provider);
  if (!src) {
    // Not in the registry = not allowed through. Ever.
    return { ok: false, error: 'refused: result from unregistered source "' + result.provider + '"' };
  }
  return {
    ok: true,
    result: {
      ...result,
      license: {
        type: 'official-api',
        provider: src.name,
        provider_terms: src.terms,
        api_docs: src.docs,
        // This tool is a search/discovery engine, not a ripper:
        bulk_download: 'disabled — metadata and official links only',
        redistribution: 'link to the official video page; embedding only via the official embed URL; follow provider terms',
        retrieved_at: new Date().toISOString(),
      },
    },
  };
}

function attachAll(results) {
  const out = [];
  for (const r of results) {
    const a = attach(r);
    if (!a.ok) return a; // one bad source poisons the batch
    out.push(a.result);
  }
  return { ok: true, results: out };
}

module.exports = { attach, attachAll };
