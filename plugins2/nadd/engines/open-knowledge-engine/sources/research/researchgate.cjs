/*
 * sources/research/researchgate.cjs — ResearchGate stub.
 *
 * STUB: ResearchGate offers no public search API, and its public pages are
 * login-gated. Per access rules this engine does not bypass logins or
 * automate ResearchGate. Declared honestly: permitted public metadata only,
 * search() returns [] and healthCheck() reports 'not_implemented'.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'researchgate',
  name: 'ResearchGate',
  category: 'research',
  transport: 'stub',
  baseUrl: 'https://www.researchgate.net',
  docsUrl: 'https://www.researchgate.net/',
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
  priority: 91,
  description:
    'ResearchGate. No public search API; content sits behind login. ' +
    'Stub: permitted public metadata only — automation would require login, ' +
    'which is not implemented per access rules.',
};

const detail = 'Permitted public metadata only; automation would require login — not implemented per access rules.';

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(meta, detail))(deps, meta),
};
