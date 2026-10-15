/*
 * sources/museums/british-library.cjs — British Library adapter (honest stub).
 *
 * The British Library has no open, keyless collection-search API for automation;
 * its discovery search lives behind a web interface (https://www.bl.uk/) with no
 * documented public search endpoint. Declared as not_implemented: search returns
 * [], healthCheck reports 'not_implemented' — never fabricated.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'british-library',
  name: 'British Library',
  category: 'museum',
  transport: 'stub',
  baseUrl: 'https://www.bl.uk',
  docsUrl: 'https://www.bl.uk/',
  implemented: false,
  status: 'not_implemented',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: false, metadata: false, images: false, api: false, license: false, citations: false },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 10,
  description: 'British Library stub: no open search API is documented for automated collection queries. See https://www.bl.uk/.',
};

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(
    meta,
    'No open collection-search API is documented for the British Library; manual search at https://www.bl.uk/'
  ))(deps, meta),
};
