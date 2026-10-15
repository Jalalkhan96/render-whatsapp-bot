/*
 * sources/libraries/nz-archives.cjs — Archives New Zealand (STUB).
 *
 * Archives New Zealand collection search (collections.archives.govt.nz) is
 * JS-driven with no open search API. Honest stub: search() returns [],
 * healthCheck reports 'limited'.
 *
 * Zero deps. CommonJS. Node 18+.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'nz-archives',
  name: 'Archives New Zealand',
  category: 'archive',
  transport: 'stub',
  baseUrl: 'https://www.archives.govt.nz',
  docsUrl: 'https://ndhadeliver.natlib.govt.nz/delivery/DeliveryManagerServlet?dps_pid=IE212285',
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
  description: 'Archives New Zealand collection search has no open API; records must be searched manually via collections.archives.govt.nz.',
};

const REASON = 'Stub: Archives New Zealand exposes no public search API. Search manually at https://collections.archives.govt.nz/web/arena/search#/search.';

module.exports = { meta, createSource: (deps) => new (makeStubSource(meta, REASON))(deps, meta) };
