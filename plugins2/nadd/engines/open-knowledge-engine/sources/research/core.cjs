/*
 * sources/research/core.cjs — CORE research API adapter.
 *
 * API: https://api.core.ac.uk/v3/search/works?q=<q>&limit=20
 *      with header Authorization: Bearer <CORE_KEY>
 * Docs: https://api.core.ac.uk/documentation/
 * requiresKey: true. Without CORE_KEY, search() returns [] and
 * healthCheck() reports 'auth_required' — never fabricated results.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { research } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'core',
  name: 'CORE',
  category: 'research',
  transport: 'api',
  baseUrl: 'https://api.core.ac.uk/v3',
  docsUrl: 'https://api.core.ac.uk/documentation/',
  implemented: true,
  status: 'ok',
  requiresKey: true,
  envKeys: ['CORE_KEY'],
  capabilities: {
    search: true,
    metadata: true,
    fullText: true,
    documents: true,
    api: true,
    bulk: false,
    license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 500 },
  priority: 9,
  description:
    'CORE open-research aggregator search: titles, abstracts, authors, ' +
    'publication dates and full-text download links. Requires a CORE_KEY; ' +
    'reports auth_required without one.',
};

class CoreSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  _key() {
    return (this.deps && this.deps.CORE_KEY) || process.env.CORE_KEY || null;
  }

  async search(query, options) {
    const key = this._key();
    if (!key) return [];
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const url = this._buildUrl('https://api.core.ac.uk/v3/search/works', { q: String(query), limit });
      const data = await this.getJson(url, { headers: { Authorization: `Bearer ${key}` } });
      const results = (data && Array.isArray(data.results)) ? data.results : [];
      return results.map((w) => this._toResult(w)).filter((r) => r.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(w) {
    w = w || {};
    const authorsRaw = Array.isArray(w.authors) ? w.authors : [];
    const authors = authorsRaw
      .map((a) => a && (a.name || a.fullName))
      .filter((n) => typeof n === 'string' && n.trim() !== '');
    const doi = noValue(w.doi, null);
    const identifiers = {};
    if (w.id != null) identifiers.core = String(w.id);
    if (doi) identifiers.doi = doi;
    const downloadUrl = noValue(w.downloadUrl, null);
    return research({
      id: w.id != null ? String(w.id) : null,
      source: this.id,
      sourceId: w.id != null ? String(w.id) : null,
      sourceUrl: noValue(w.sourceFulltextUrl, null) || (doi ? `https://doi.org/${doi}` : null),
      title: noValue(w.title, null),
      description: noValue(w.abstract, null),
      type: 'research',
      creator: authors[0] || null,
      date: noValue(w.publishedDate, null),
      language: noValue(w.language, null),
      contentUrl: downloadUrl,
      identifiers,
      tags: [],
      categories: [],
      authors,
      journal: noValue(w.publisher, null),
      publicationDate: noValue(w.publishedDate, null),
      citations: 0,
      doi,
      url: noValue(w.sourceFulltextUrl, null) || (doi ? `https://doi.org/${doi}` : null),
      openAccess: downloadUrl != null, // a download link was returned by the API.
    });
  }

  async healthCheck() {
    const t0 = Date.now();
    if (!this._key()) {
      return { id: this.id, status: 'auth_required', latencyMs: 0, detail: 'CORE_KEY not configured' };
    }
    try {
      const rows = await this.search('science', { limit: 1 });
      return {
        id: this.id,
        status: rows.length > 0 ? 'ok' : 'degraded',
        latencyMs: Date.now() - t0,
        detail: `API probe returned ${rows.length} result(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new CoreSource(deps, meta),
};
