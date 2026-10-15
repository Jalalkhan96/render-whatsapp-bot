/*
 * sources/books/manybooks.cjs — ManyBooks adapter (GROUP B).
 *
 * HONEST STUB. ManyBooks (manybooks.net) offers no public search API —
 * its catalog is only reachable through the website UI. Until an API or
 * dump-based path is wired, this adapter returns [] and reports
 * not_implemented.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'manybooks',
  name: 'ManyBooks',
  category: 'ebooks',
  transport: 'stub',
  baseUrl: 'https://manybooks.net',
  docsUrl: 'https://manybooks.net',
  implemented: false,
  status: 'not_implemented',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: false, metadata: false, fullText: false, images: false, documents: false,
    downloads: false, api: false, bulk: false, coordinates: false, license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 10, delayMs: 6000, maxPages: 5, maxResults: 20 },
  priority: 90,
  description: 'ManyBooks ebook catalog. No public search API exists; stub returns no results and reports its declared status rather than fabricating them.',
};

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(meta, 'No public search API; see docs'))(deps, meta),
};
