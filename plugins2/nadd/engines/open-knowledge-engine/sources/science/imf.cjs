/*
 * sources/science/imf.cjs — IMF Data Services (SDMX-JSON) stub ('limited').
 *
 * Status 'limited' / implemented:false. Verified 2026-10-05: both
 *   http://dataservices.imf.org/REST/SDMX_JSON.svc/Dataflow and
 *   https://dataservices.imf.org/REST/SDMX_JSON.svc/Dataflow
 * failed to connect from the probe host, and no lightweight catalogue
 * endpoint could be verified in the bounded probe. The Dataflow list is
 * also known to be heavy, so per the no-massive-SDMX rule this adapter
 * stays a stub: search() returns [] and healthCheck() reports the honest
 * detail. Never fabricates numbers.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'imf',
  name: 'IMF Data Services',
  category: 'statistics',
  transport: 'stub',
  baseUrl: 'https://dataservices.imf.org/REST/SDMX_JSON.svc',
  docsUrl: 'https://data.imf.org/',
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
    'IMF Data Services SDMX-JSON API. The service was unreachable from ' +
    'the probe (verified 2026-10-05, http and https) and no lightweight ' +
    'catalogue endpoint was verified. Stub only: search returns [], ' +
    'browse at https://data.imf.org/.',
};

const detail =
  'dataservices.imf.org/REST/SDMX_JSON.svc was unreachable from the ' +
  'probe host (verified 2026-10-05, both http and https) and no ' +
  'lightweight Dataflow catalogue endpoint could be verified; massive ' +
  'SDMX downloads are deliberately avoided. search returns []. Browse ' +
  'at https://data.imf.org/.';

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(meta, detail))(deps, meta),
};
