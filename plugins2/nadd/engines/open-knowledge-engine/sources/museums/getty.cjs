/*
 * sources/museums/getty.cjs — Getty (J. Paul Getty Trust) adapter (honest stub).
 *
 * Getty publishes linked open data (data.getty.edu) and museum object pages,
 * but there is no clean, keyless public search API suitable for automation
 * (Getty vocabularies are SPARQL endpoints for vocab terms, not a collection
 * search API). Declared 'limited': search returns [], healthCheck reports
 * 'limited' — never fabricated.
 */
'use strict';

const { makeStubSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'getty',
  name: 'Getty Museum',
  category: 'museum',
  transport: 'stub',
  baseUrl: 'https://www.getty.edu',
  docsUrl: 'https://www.getty.edu/research/tools/data/',
  implemented: false,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: { search: false, metadata: false, images: false, api: false, license: false, citations: false },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, maxPages: 5, maxResults: 20 },
  priority: 10,
  description: 'Getty stub (limited): data.getty.edu publishes linked open data, but no simple public collection-search API for automation. See https://www.getty.edu/research/tools/data/.',
};

module.exports = {
  meta,
  createSource: (deps) => new (makeStubSource(
    meta,
    'Getty has no clean public search API for automation (linked-open-data only); manual search at https://www.getty.edu/. See https://www.getty.edu/research/tools/data/'
  ))(deps, meta),
};
