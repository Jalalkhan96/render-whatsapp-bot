/*
 * sources/maps/wikimapia.cjs — Wikimapia (STUB, limited).
 *
 * Access conditions checked 2026-10-05: api.wikimapia.org responds, but
 * access is inconsistent (answers even with a bogus key, no documented
 * stable public contract; docs at https://wikimapia.org/api/ describe a
 * key-gated API). There is no stable open search API we can rely on, so
 * this adapter honestly declares 'limited' and returns no results (§75).
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'wikimapia',
  name: 'Wikimapia',
  category: 'maps',
  transport: 'stub',
  baseUrl: 'https://wikimapia.org',
  docsUrl: 'https://wikimapia.org/api/',
  implemented: false,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: false, metadata: false, fullText: false, images: false, documents: false,
    downloads: false, api: false, bulk: false, coordinates: false,
    license: false, citations: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 2000, maxResults: 20 },
  priority: 9,
  description: 'Wikimapia community-annotated map. STUB: no stable public search API — the documented api.wikimapia.org interface has inconsistent access conditions, so this adapter is honestly limited and returns no results.',
};

function createSource(deps) {
  return new (makeStubSource(meta, 'limited: Wikimapia offers no stable open search API'))(deps, meta);
}

module.exports = { meta, createSource };
