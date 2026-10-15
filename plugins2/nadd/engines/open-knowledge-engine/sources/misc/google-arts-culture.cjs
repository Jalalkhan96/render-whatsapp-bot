/*
 * sources/misc/google-arts-culture.cjs — Google Arts & Culture adapter (honest stub).
 *
 * artsandculture.google.com has NO public search API, and artwork
 * redistribution by partners is restricted. Search returns [],
 * healthCheck reports 'not_implemented' — never fabricated results.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'google-arts-culture',
  name: 'Google Arts & Culture',
  category: 'culture',
  transport: 'stub',
  baseUrl: 'https://artsandculture.google.com',
  docsUrl: 'https://artsandculture.google.com',
  implemented: false,
  status: 'not_implemented',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: false, metadata: false, images: false, api: false, license: false, citations: false },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 10,
  description: 'Google Arts & Culture stub: discovery metadata only; no redistribution; no automation implemented (artsandculture.google.com exposes no public search API and artwork reuse is partner-restricted).',
};

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(
    meta,
    'discovery metadata only; no redistribution; no automation implemented — artsandculture.google.com has no public search API; browse manually at https://artsandculture.google.com'
  ))(deps, meta),
};
