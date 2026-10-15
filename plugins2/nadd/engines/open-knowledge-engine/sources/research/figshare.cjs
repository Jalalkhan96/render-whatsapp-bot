/*
 * sources/research/figshare.cjs — figshare article search adapter.
 *
 * API: POST https://api.figshare.com/v2/articles/search
 *      body {"search_for":"<q>","page_size":20}
 * Docs: https://docs.figshare.com/#articles_search
 * The core http client supports method/body/headers via opts. Category
 * 'dataset'. No key required.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { dataset } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'figshare',
  name: 'figshare',
  category: 'dataset',
  transport: 'api',
  baseUrl: 'https://api.figshare.com/v2',
  docsUrl: 'https://docs.figshare.com/#articles_search',
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
  priority: 11,
  description:
    'figshare repository search (POST articles/search): titles, authors, ' +
    'descriptions, publication dates, DOIs, licenses and tags. No key required.',
};

function stripHtml(s) {
  if (typeof s !== 'string') return null;
  const t = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

class FigshareSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const data = await this.getJson('https://api.figshare.com/v2/articles/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_for: String(query), page_size: limit }),
      });
      const articles = Array.isArray(data) ? data : [];
      return articles.map((a) => this._toResult(a)).filter((r) => r.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(a) {
    a = a || {};
    const authorsRaw = Array.isArray(a.authors) ? a.authors : [];
    const authors = authorsRaw
      .map((x) => x && x.full_name)
      .filter((n) => typeof n === 'string' && n.trim() !== '');
    const doi = noValue(a.doi, null);
    const identifiers = {};
    if (doi) identifiers.doi = doi;
    const lic = a.license || {};
    const tagsRaw = Array.isArray(a.tags) ? a.tags : [];
    return dataset({
      id: a.id != null ? String(a.id) : null,
      source: this.id,
      sourceId: a.id != null ? String(a.id) : null,
      sourceUrl: noValue(a.url, null) || (doi ? `https://doi.org/${doi}` : null),
      title: noValue(a.title, null),
      description: stripHtml(a.description),
      type: 'dataset',
      creator: authors[0] || null,
      date: noValue(a.published_date, null),
      updatedAt: noValue(a.modified_date, null),
      contentUrl: noValue(a.url, null),
      license: noValue(lic.name, null),
      licenseUrl: noValue(lic.url, null),
      identifiers,
      tags: tagsRaw.map((t) => (t && t.name) || t).filter((t) => typeof t === 'string'),
      categories: a.defined_type_name ? [String(a.defined_type_name)] : [],
      publisher: 'figshare',
      datasetMetadata: {
        defined_type: noValue(a.defined_type_name, null),
        resource_doi: doi,
      },
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
        detail: `POST probe returned ${rows.length} result(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new FigshareSource(deps, meta),
};
