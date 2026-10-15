/*
 * sources/science/unesco-uis.cjs — UNESCO Institute for Statistics (SDMX) stub ('limited').
 *
 * Status 'limited' / implemented:false. Verified 2026-10-05: the UIS
 * SDMX endpoint http://api.uis.unesco.org/sdmx/dataflow returns
 * HTTP 301 (CloudFront) and following the redirect ends in HTTP 404 —
 * the endpoint has moved/been retired. No working catalogue endpoint was
 * found in the bounded probe, so search() returns [] and healthCheck()
 * reports the honest detail. Never fabricates numbers.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'unesco-uis',
  name: 'UNESCO Institute for Statistics',
  category: 'statistics',
  transport: 'stub',
  baseUrl: 'http://api.uis.unesco.org/sdmx',
  docsUrl: 'http://data.uis.unesco.org/',
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
    'UNESCO Institute for Statistics SDMX API. The catalogue endpoint ' +
    'has moved (verified 2026-10-05: 301 then 404) and no working ' +
    'replacement was found in the bounded probe. Stub only: search ' +
    'returns [], browse at http://data.uis.unesco.org/.',
};

const detail =
  'UIS SDMX endpoint http://api.uis.unesco.org/sdmx/dataflow returned ' +
  'HTTP 301 (CloudFront) and the redirect target returned HTTP 404 ' +
  '(verified 2026-10-05); no working catalogue endpoint was found in the ' +
  'bounded probe. search returns []. Browse at http://data.uis.unesco.org/.';

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(meta, detail))(deps, meta),
};
