/*
 * sources/maps/geograph.cjs — Geograph Britain & Ireland photo archive (STUB, limited).
 *
 * Endpoint checked 2026-10-05: the documented API
 *   https://api.geograph.org.uk/api-v1.php
 * returns 404 Not Found, and https://api.geograph.org.uk/api-faq.php is
 * unreachable — the API documented there is no longer available, so no
 * clean endpoint exists. Honest 'limited' stub, no fabrication (§75).
 * Geograph photos are normally CC-BY-SA-2.0, but without a live API we
 * return no results rather than claiming otherwise.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'geograph',
  name: 'Geograph Britain & Ireland',
  category: 'maps',
  transport: 'stub',
  baseUrl: 'https://www.geograph.org.uk',
  docsUrl: 'https://api.geograph.org.uk/api-faq.php',
  implemented: false,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: false, metadata: false, fullText: false, images: false, documents: false,
    downloads: false, api: false, bulk: false, coordinates: false,
    license: false, citations: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 2000, maxResults: 20 },
  priority: 9,
  description: 'Geograph Britain & Ireland geolocated photo archive. STUB: the documented api.geograph.org.uk API endpoint returned 404 on 2026-10-05 — no clean endpoint exists, so this adapter is honestly limited and returns no results.',
};

function createSource(deps) {
  return new (makeStubSource(meta, 'limited: documented Geograph API endpoint is no longer reachable (404 on api-v1.php)'))(deps, meta);
}

module.exports = { meta, createSource };
