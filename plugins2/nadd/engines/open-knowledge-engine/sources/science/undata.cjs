/*
 * sources/science/undata.cjs — UN Data (data.un.org) stub.
 *
 * Status 'limited' / implemented:false. UN Data has no open search API:
 * data.un.org is a web portal with downloadable tables but no public
 * JSON search endpoint. search() returns [] and healthCheck() reports the
 * honest detail with a pointer to https://data.un.org/. Never fabricates
 * results.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'undata',
  name: 'UN Data',
  category: 'statistics',
  transport: 'stub',
  baseUrl: 'https://data.un.org',
  docsUrl: 'https://data.un.org/',
  implemented: false,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: false,
    metadata: false,
    api: false,
    bulk: false,
    license: false,
    citations: false,
    coordinates: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 3,
  description:
    'UN Data (data.un.org) — the UN Statistics Division portal. It has no ' +
    'open search API (web portal with downloadable tables only), so this ' +
    'adapter is a stub: search returns [], browse at https://data.un.org/.',
};

const detail =
  'UN Data (data.un.org) exposes no open search API — it is a web portal ' +
  'with downloadable statistical tables, not a queryable JSON service. ' +
  'search returns []. Browse manually at https://data.un.org/.';

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(meta, detail))(deps, meta),
};
