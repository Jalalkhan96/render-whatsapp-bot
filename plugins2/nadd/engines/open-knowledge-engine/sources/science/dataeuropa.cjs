/*
 * sources/science/dataeuropa.cjs — data.europa.eu (EU open data portal) stub.
 *
 * Status 'limited' / implemented:false. Verified 2026-10-05:
 *   GET https://data.europa.eu/api/hub/search/datasets?q=climate&limit=2
 *     -> HTTP 400 "Bad Request" (also with ?query=)
 *   POST https://data.europa.eu/api/hub/search/datasets (JSON body)
 *     -> connection timed out from the probe host
 * No working open search endpoint could be verified, so search() returns []
 * and healthCheck() reports the honest detail. Never fabricates results.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'dataeuropa',
  name: 'data.europa.eu',
  category: 'statistics',
  transport: 'stub',
  baseUrl: 'https://data.europa.eu',
  docsUrl: 'https://data.europa.eu/en',
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
    'EU open data portal (data.europa.eu). The documented hub search ' +
    'endpoint could not be verified (verified 2026-10-05: GET returns ' +
    'HTTP 400, POST probe timed out). No working open search endpoint — ' +
    'stub only.',
};

const detail =
  'data.europa.eu hub search endpoint not verified as working: GET ' +
  '/api/hub/search/datasets returned HTTP 400 "Bad Request" (verified ' +
  '2026-10-05, both q and query params), and a POST probe timed out. ' +
  'search returns []. Browse manually at https://data.europa.eu.';

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(meta, detail))(deps, meta),
};
