/*
 * sources/research/osf.cjs — Open Science Framework preprints adapter.
 *
 * API: https://api.osf.io/v2/preprints/?filter[title]=<q>&page[size]=20
 * Docs: https://developer.osf.io/
 * data[].attributes carries title, description, date_published, doi and tags;
 * links.html is the public page. No key required.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { research } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'osf',
  name: 'OSF Preprints',
  category: 'research',
  transport: 'api',
  baseUrl: 'https://api.osf.io/v2',
  docsUrl: 'https://developer.osf.io/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true,
    metadata: true,
    fullText: false,
    documents: true,
    api: true,
    bulk: false,
    license: true,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 500 },
  priority: 13,
  description:
    'Open Science Framework preprints search: titles, descriptions, ' +
    'publication dates, DOIs and tags. Preprints are open access by design. ' +
    'No key required.',
};

function clean(s) {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

class OsfSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const params = {
        'filter[title]': String(query),
        'page[size]': limit,
      };
      const url = this._buildUrl('https://api.osf.io/v2/preprints/', params);
      const data = await this.getJson(url);
      const items = (data && Array.isArray(data.data)) ? data.data : [];
      return items.map((it) => this._toResult(it)).filter((r) => r.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(it) {
    it = it || {};
    const attrs = it.attributes || {};
    const links = it.links || {};
    const doi = noValue(attrs.doi, null);
    const identifiers = {};
    if (doi) identifiers.doi = doi;
    const subjects = Array.isArray(attrs.subjects) ? attrs.subjects : [];
    const html = noValue(links.html, null);
    return research({
      id: it.id || null,
      source: this.id,
      sourceId: it.id || null,
      sourceUrl: html || (doi ? `https://doi.org/${doi}` : null),
      title: clean(attrs.title),
      description: clean(attrs.description),
      type: 'research',
      creator: null,
      date: noValue(attrs.date_published, null),
      identifiers,
      tags: Array.isArray(attrs.tags) ? attrs.tags.filter((t) => typeof t === 'string') : [],
      categories: subjects.slice(0, 3).map((s) => s && s.text).filter((t) => typeof t === 'string' && t !== ''),
      journal: null,
      publicationDate: noValue(attrs.date_published, null),
      citations: 0,
      doi,
      url: html || (doi ? `https://doi.org/${doi}` : null),
      openAccess: true, // OSF preprints are open access by design.
    });
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const rows = await this.search('science', { limit: 1 });
      return {
        id: this.id,
        status: rows.length > 0 ? 'ok' : 'degraded',
        latencyMs: Date.now() - t0,
        detail: `preprints probe returned ${rows.length} result(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new OsfSource(deps, meta),
};
