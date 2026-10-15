/*
 * sources/museums/yale.cjs — Yale University Collections adapter (honest stub).
 *
 * Yale's collections portals (collections.library.yale.edu) expose IIIF
 * manifests for individual objects, but there is no open, keyless collection
 * search API for automation. Declared 'limited': search returns [],
 * healthCheck reports 'limited' — never fabricated.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'yale',
  name: 'Yale University Collections',
  category: 'museum',
  transport: 'stub',
  baseUrl: 'https://collections.library.yale.edu',
  docsUrl: 'https://collections.library.yale.edu/',
  implemented: false,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: false, metadata: false, images: false, api: false, license: false, citations: false },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 10,
  description: 'Yale stub (limited): IIIF manifests exist per object, but no open collection-search API for automation. See https://collections.library.yale.edu/.',
};

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(
    meta,
    'Yale collections expose IIIF per object but no open search API for automation; manual search at https://collections.library.yale.edu/'
  ))(deps, meta),
};
