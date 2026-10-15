/*
 * sources/aggregators/open-product-data.cjs — Open Product Data aggregation adapter.
 *
 * STUB (not_implemented) BY DESIGN. This is a reserved aggregation slot for
 * openly-licensed product datasets — there is no single "open product data"
 * endpoint to call. Candidate datasets (each openly licensed and accessed
 * through their own official API/dump, not scraped) include the Open*Facts
 * family (ODbL) and other public product-data dumps. Until a concrete
 * dataset is wired in, this adapter honestly returns [] and declares
 * 'not_implemented'. It never fabricates products.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'open-product-data',
  name: 'Open Product Data',
  category: 'product',
  transport: 'stub',
  baseUrl: null,
  docsUrl: null,
  implemented: false,
  status: 'not_implemented',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: false, metadata: false, api: false, bulk: false, coordinates: false,
    license: false, citations: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 9,
  description: 'STUB: reserved aggregation slot for openly-licensed product datasets. No single endpoint exists for "open product data"; candidate sources (Open Food/Beauty/Products Facts, public dumps) have their own adapters. Honestly not implemented — returns [] rather than fabricated products.',
};

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(module.exports.meta, 'reserved aggregation slot: no openly-licensed product dataset wired in yet'))(deps, module.exports.meta),
};
