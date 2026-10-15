/*
 * sources/misc/picryl.cjs — Picryl public-domain media aggregator (honest stub).
 *
 * picryl.com aggregates public-domain media but exposes no public search API;
 * its search page is Cloudflare-gated with no stable machine-readable pattern
 * (verified 2026-10-05: /search?q=<q> returned empty/inconsistent responses).
 * Declared 'limited': search returns [], healthCheck reports 'limited'.
 *
 * IMPORTANT (§38): even if records are returned in future, rights must be
 * verified per asset from the record's own statement — never assume visible
 * media is public domain. Use https://picryl.com manually.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'picryl',
  name: 'Picryl',
  category: 'archive',
  transport: 'stub',
  baseUrl: 'https://picryl.com',
  docsUrl: 'https://picryl.com',
  implemented: false,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: false, metadata: false, images: false, api: false, license: false, citations: false },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 10,
  description: 'Picryl stub (limited): aggregates public-domain media but offers no public search API (Cloudflare-gated search page, no stable pattern 2026-10-05). Rights must be verified per asset; browse manually at https://picryl.com.',
};

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(
    meta,
    'picryl.com has no public search API (search page is Cloudflare-gated with no stable machine-readable pattern, verified 2026-10-05); verify rights per asset and browse manually at https://picryl.com'
  ))(deps, meta),
};
