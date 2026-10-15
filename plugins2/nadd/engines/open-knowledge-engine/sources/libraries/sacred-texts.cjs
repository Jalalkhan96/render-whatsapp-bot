/*
 * sources/libraries/sacred-texts.cjs — Internet Sacred Text Archive (STUB).
 *
 * sacred-texts.com is HTML-only with no search API, and individual texts
 * carry their own copyright/usage nuances. Deliberately a stub: no scraping
 * automation, no results — declared 'limited' and documented honestly.
 *
 * Zero deps. CommonJS. Node 18+.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'sacred-texts',
  name: 'Internet Sacred Text Archive',
  category: 'language',
  transport: 'stub',
  baseUrl: 'https://sacred-texts.com',
  docsUrl: 'https://sacred-texts.com/index.htm',
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
  priority: 20,
  description: 'Internet Sacred Text Archive: HTML-only site, no API, per-text copyright nuances. Not scraped; consult https://sacred-texts.com directly.',
};

const REASON = 'Stub: sacred-texts.com is HTML-only with per-text copyright nuances; no API and no scraping automation by design. Visit https://sacred-texts.com directly.';

module.exports = { meta, createSource: (deps) => new (makeStubSource(meta, REASON))(deps, meta) };
