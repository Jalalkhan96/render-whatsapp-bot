/*
 * sources/libraries/naa.cjs — National Archives of Australia (STUB).
 *
 * The NAA collection search (recordsearch.naa.gov.au) is JS-driven and offers
 * no open search API. Honest stub: search() returns [], healthCheck 'limited'.
 *
 * Zero deps. CommonJS. Node 18+.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'naa',
  name: 'National Archives of Australia',
  category: 'archive',
  transport: 'stub',
  baseUrl: 'https://www.naa.gov.au',
  docsUrl: 'https://www.naa.gov.au/explore-collection/search-collection',
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
  description: 'National Archives of Australia collection search has no open API; records must be searched manually via recordsearch.naa.gov.au.',
};

const REASON = 'Stub: NAA RecordSearch exposes no public API. Search manually at https://recordsearch.naa.gov.au/SearchNRetrieve/Interface/SearchScreens/BasicSearch.aspx.';

module.exports = { meta, createSource: (deps) => new (makeStubSource(meta, REASON))(deps, meta) };
