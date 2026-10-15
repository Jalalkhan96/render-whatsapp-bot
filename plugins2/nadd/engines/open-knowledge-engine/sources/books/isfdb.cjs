/*
 * sources/books/isfdb.cjs — ISFDB adapter (GROUP B).
 *
 * HONEST STUB. The Internet Speculative Fiction Database (isfdb.org) offers
 * no public search API — its data is accessed through the website UI or via
 * licensed database dumps for research use. Until an API or dump-based path
 * is wired, this adapter returns [] and reports not_implemented.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'isfdb',
  name: 'ISFDB (Internet Speculative Fiction Database)',
  category: 'books',
  transport: 'stub',
  baseUrl: 'http://www.isfdb.org',
  docsUrl: 'http://www.isfdb.org',
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
  description: 'ISFDB speculative-fiction bibliography. No public search API exists; stub returns no results and reports its declared status rather than fabricating them.',
};

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(meta, 'No public search API; see docs'))(deps, meta),
};
