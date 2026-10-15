/*
 * sources/maps/uk-web-archive.cjs — UK Web Archive (STUB, limited).
 *
 * Checked 2026-10-05: the UK Web Archive search at webarchive.org.uk is
 * JavaScript-driven with no stable public API for querying captures.
 * Honest 'limited' stub — no results, no fabrication (§75). For archived
 * web content, use the wayback or loc-web-archives adapters.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'uk-web-archive',
  name: 'UK Web Archive',
  category: 'web_archive',
  transport: 'stub',
  baseUrl: 'https://www.webarchive.org.uk',
  docsUrl: 'https://www.webarchive.org.uk/',
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
  description: 'UK Web Archive (British Library) archived websites. STUB: search at webarchive.org.uk is JS-driven with no stable public API, so this adapter is honestly limited and returns no results.',
};

function createSource(deps) {
  return new (makeStubSource(meta, 'limited: UK Web Archive search is JS-driven; no stable public API'))(deps, meta);
}

module.exports = { meta, createSource };
