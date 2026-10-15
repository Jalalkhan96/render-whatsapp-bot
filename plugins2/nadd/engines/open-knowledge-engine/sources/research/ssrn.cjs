/*
 * sources/research/ssrn.cjs — SSRN (Social Science Research Network) stub.
 *
 * STUB: SSRN exposes no public search API. Their data is available through
 * paid/partner feeds (e.g. via Elsevier) or login-gated web search, neither
 * of which this engine automates. Honest stub: search() returns [] and
 * healthCheck() reports 'not_implemented'.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'ssrn',
  name: 'SSRN',
  category: 'research',
  transport: 'stub',
  baseUrl: 'https://www.ssrn.com',
  docsUrl: 'https://www.ssrn.com/',
  implemented: false,
  status: 'not_implemented',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: false,
    metadata: false,
    fullText: false,
    documents: false,
    api: false,
    bulk: false,
    license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 500 },
  priority: 90,
  description:
    'SSRN (Social Science Research Network). No public search API is offered; ' +
    'stub — search returns no results rather than fabricating any.',
};

const detail = 'No public search API offered by SSRN; stub returns [] (no fabrication).';

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(meta, detail))(deps, meta),
};
