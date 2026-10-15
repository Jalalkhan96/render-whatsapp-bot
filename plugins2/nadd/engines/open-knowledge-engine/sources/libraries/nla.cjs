/*
 * sources/libraries/nla.cjs — National Library of Australia catalogue (STUB).
 *
 * The NLA's own catalogue (catalogue.nla.gov.au) has no open JSON search API;
 * its records are covered by the 'trove' adapter (Trove API v3, category
 * filterable). Honest stub: search() returns [], healthCheck reports 'limited'.
 *
 * Zero deps. CommonJS. Node 18+.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'nla',
  name: 'National Library of Australia (catalogue)',
  category: 'archive',
  transport: 'stub',
  baseUrl: 'https://catalogue.nla.gov.au',
  docsUrl: 'https://www.nla.gov.au/using-library/research-tools-and-resources',
  implemented: false,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: false,
    metadata: false,
    fullText: false,
    images: false,
    documents: false,
    api: false,
    license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 30,
  description: 'NLA catalogue has no open search API. Use the trove adapter (same institution) for NLA records.',
};

const REASON = 'Stub: the NLA catalogue exposes no public search API; query the trove adapter instead (https://catalogue.nla.gov.au for manual search).';

module.exports = { meta, createSource: (deps) => new (makeStubSource(meta, REASON))(deps, meta) };
