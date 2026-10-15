/*
 * sources/misc/public-domain-review.cjs — The Public Domain Review adapter (honest stub).
 *
 * publicdomainreview.org is a curated editorial publication, not an API:
 * there is no open search API or feed suitable for automation. Declared
 * 'limited': search returns [], healthCheck reports 'limited' — never
 * fabricated results.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'public-domain-review',
  name: 'The Public Domain Review',
  category: 'culture',
  transport: 'stub',
  baseUrl: 'https://publicdomainreview.org',
  docsUrl: 'https://publicdomainreview.org',
  implemented: false,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: false, metadata: false, images: false, api: false, license: false, citations: false },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 10,
  description: 'The Public Domain Review stub (limited): curated editorial site at https://publicdomainreview.org with no open search API; browse manually for public-domain essays and collections.',
};

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(
    meta,
    'publicdomainreview.org is a curated editorial site with no open search API; browse manually at https://publicdomainreview.org'
  ))(deps, meta),
};
