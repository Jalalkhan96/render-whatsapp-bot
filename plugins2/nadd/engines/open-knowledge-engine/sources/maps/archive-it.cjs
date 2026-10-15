/*
 * sources/maps/archive-it.cjs — Archive-It web archive collections (STUB, limited).
 *
 * Checked 2026-10-05: Archive-It (archive-it.org) exposes partner
 * collections but provides no open search API for querying captures across
 * collections. Honest 'limited' stub — no results, no fabrication (§75).
 * For archived web content, use the wayback or loc-web-archives adapters.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'archive-it',
  name: 'Archive-It',
  category: 'web_archive',
  transport: 'stub',
  baseUrl: 'https://www.archive-it.org',
  docsUrl: 'https://www.archive-it.org/',
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
  priority: 10,
  description: 'Archive-It curated web-archive collections. STUB: no open search API exists for querying captures across Archive-It collections, so this adapter is honestly limited and returns no results.',
};

function createSource(deps) {
  return new (makeStubSource(meta, 'limited: Archive-It provides no open search API for its collections'))(deps, meta);
}

module.exports = { meta, createSource };
