/*
 * sources/science/datagovuk.cjs — data.gov.uk (UK open data portal) stub.
 *
 * Status 'limited' / implemented:false. Verified 2026-10-05: the legacy
 * CKAN endpoint https://data.gov.uk/api/3/action/package_search returns
 * HTTP 301 redirecting to the new "Find open data" platform
 * (https://www.data.gov.uk/api/3/action/package_search), whose response
 * is an HTML welcome page — the CKAN JSON API is dead. No open search
 * API for the new platform has been verified, so search() returns [] and
 * healthCheck() reports the honest detail. Never fabricates results.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'datagovuk',
  name: 'data.gov.uk',
  category: 'statistics',
  transport: 'stub',
  baseUrl: 'https://www.data.gov.uk',
  docsUrl: 'https://www.data.gov.uk/',
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
    'UK government open data portal (data.gov.uk). The legacy CKAN ' +
    'package_search API is dead (verified 2026-10-05: HTTP 301 to the new ' +
    '"Find open data" platform, which serves HTML, not JSON). No open ' +
    'search API verified — stub only.',
};

const detail =
  'data.gov.uk migrated off CKAN: /api/3/action/package_search returns ' +
  'HTTP 301 to the new "Find open data" platform (verified 2026-10-05), ' +
  'which serves an HTML page rather than the CKAN JSON API. No working ' +
  'open search endpoint has been verified for the new platform; search ' +
  'returns []. Browse manually at https://www.data.gov.uk.';

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(meta, detail))(deps, meta),
};
