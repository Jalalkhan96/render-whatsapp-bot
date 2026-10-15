/*
 * sources/science/oecd.cjs — OECD SDMX statistics stub ('limited').
 *
 * Status 'limited' / implemented:false. Verified 2026-10-05: the OECD
 * SDMX-REST dataflow catalogue
 *   https://sdmx.oecd.org/public/rest/v1/dataflow/all/all
 * responds but is ~8.9 MB of XML — far too heavy for a per-query fetch
 * (the core http layer caps bodies at ~8MB), and no lightweight catalogue
 * endpoint was found in the bounded probe. Per the no-massive-SDMX rule,
 * this adapter stays dataset-metadata-level without a verified light
 * catalogue: search() returns [] and healthCheck() reports the honest
 * detail. Never fabricates numbers.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'oecd',
  name: 'OECD Data (SDMX)',
  category: 'statistics',
  transport: 'stub',
  baseUrl: 'https://sdmx.oecd.org/public/rest/v1',
  docsUrl: 'https://data.oecd.org/',
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
    'OECD statistics via SDMX-REST. The dataflow catalogue is ~9 MB of ' +
    'XML (verified 2026-10-05) — unsuitable for per-query download — and ' +
    'no lightweight catalogue endpoint was found. Stub only: search ' +
    'returns [], browse at https://data.oecd.org/.',
};

const detail =
  'OECD SDMX-REST dataflow catalogue (~8.9 MB XML, verified 2026-10-05) ' +
  'exceeds the safe per-query fetch budget and no lightweight catalogue ' +
  'endpoint was found in the bounded probe; massive SDMX downloads are ' +
  'deliberately avoided. search returns []. Browse at ' +
  'https://data.oecd.org/ or query https://sdmx.oecd.org/public/rest/v1 ' +
  'directly with a known dataflow key.';

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(meta, detail))(deps, meta),
};
