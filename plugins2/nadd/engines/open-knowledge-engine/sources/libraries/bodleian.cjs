/*
 * sources/libraries/bodleian.cjs — Digital Bodleian (LIMITED).
 *
 * Verified 2026-10-05: Digital Bodleian's search is JS-driven (no stable
 * public search API); the IIIF Presentation collection endpoint probed
 * (https://iiif.bodleian.ox.ac.uk/iiif/presentation/2/collection/top)
 * returns HTTP 400. Per-item IIIF manifests exist
 * (https://iiif.bodleian.ox.ac.uk/iiif/presentation/2/manifest/<id>) but there
 * is no machine-readable catalogue search. Declared 'limited': search()
 * returns [], healthCheck explains why. Search manually at
 * https://digital.bodleian.ox.ac.uk/.
 *
 * Zero deps. CommonJS. Node 18+.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'bodleian',
  name: 'Digital Bodleian (Oxford)',
  category: 'archive',
  transport: 'api',
  baseUrl: 'https://digital.bodleian.ox.ac.uk',
  docsUrl: 'https://digital.bodleian.ox.ac.uk',
  implemented: true,
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
  priority: 40,
  description: 'Digital Bodleian (Oxford): JS-driven catalogue with no stable public search API. Per-item IIIF manifests exist; search manually.',
};

const DETAIL = 'Limited: Digital Bodleian has no stable public search API (site search is JS-driven; IIIF collection endpoint returns 400). Per-item IIIF manifests exist at https://iiif.bodleian.ox.ac.uk/iiif/presentation/2/manifest/<id>. Search manually at https://digital.bodleian.ox.ac.uk/.';

class BodleianSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async search(_query, _options) {
    // No stable endpoint — never fabricate results.
    return [];
  }

  async getItem(_id, _options) {
    return null;
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getText('https://digital.bodleian.ox.ac.uk/', { timeoutMs: 8000, maxRetries: 0 });
      return { id: this.id, status: 'limited', latencyMs: Date.now() - t0, detail: 'Site reachable. ' + DETAIL };
    } catch (err) {
      return { id: this.id, status: 'limited', latencyMs: Date.now() - t0, detail: DETAIL };
    }
  }
}

module.exports = { meta, createSource: (deps) => new BodleianSource(deps, meta) };
