/*
 * sources/research/crossref.cjs — Crossref works metadata adapter.
 *
 * API: https://api.crossref.org/works?query=<q>&rows=20
 * Docs: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
 * No API key required. Optional mailto (CROSSREF_EMAIL) appended as a query
 * param for the polite pool. Citation counts come from is-referenced-by-count.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { research } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'crossref',
  name: 'Crossref',
  category: 'research',
  transport: 'api',
  baseUrl: 'https://api.crossref.org',
  docsUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: ['CROSSREF_EMAIL'],
  capabilities: {
    search: true,
    metadata: true,
    fullText: false,
    documents: true,
    api: true,
    bulk: false,
    license: true,
    citations: true,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 500 },
  priority: 2,
  description:
    'Crossref scholarly metadata: DOI resolution, titles, authors, journal, ' +
    'publication dates and cited-by counts for ~140M records. No key required.',
};

function stripJats(s) {
  if (typeof s !== 'string') return null;
  const t = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

function datePartsToString(pub) {
  if (!pub || !Array.isArray(pub['date-parts']) || !pub['date-parts'][0]) return null;
  const parts = pub['date-parts'][0].filter((p) => p !== null && p !== undefined);
  return parts.length > 0 ? parts.join('-') : null;
}

class CrossrefSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  _email() {
    return (this.deps && this.deps.CROSSREF_EMAIL) || process.env.CROSSREF_EMAIL || null;
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const params = { query: String(query), rows: limit };
      const email = this._email();
      if (email) params.mailto = email;
      const url = this._buildUrl('https://api.crossref.org/works', params);
      const data = await this.getJson(url);
      const items = (data && data.message && Array.isArray(data.message.items)) ? data.message.items : [];
      return items.map((it) => this._toResult(it)).filter((r) => r.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(it) {
    it = it || {};
    const titles = Array.isArray(it.title) ? it.title : [];
    const authorsRaw = Array.isArray(it.author) ? it.author : [];
    const authors = authorsRaw
      .map((a) => [a.given, a.family].filter((s) => typeof s === 'string' && s.trim() !== '').join(' ').trim())
      .filter((n) => n !== '');
    const containers = Array.isArray(it['container-title']) ? it['container-title'] : [];
    const licenses = Array.isArray(it.license) ? it.license : [];
    const identifiers = {};
    if (it.DOI) identifiers.doi = String(it.DOI);
    if (Array.isArray(it.ISSN)) identifiers.issn = it.ISSN.filter(Boolean).map(String);
    const doiUrl = it.DOI ? `https://doi.org/${it.DOI}` : null;
    return research({
      id: it.DOI || null,
      source: this.id,
      sourceId: it.DOI || null,
      sourceUrl: noValue(it.URL, null) || doiUrl,
      title: noValue(titles[0], null),
      description: stripJats(it.abstract),
      type: 'research',
      creator: authors[0] || null,
      date: datePartsToString(it.published || it.created),
      language: noValue(it.language, null),
      licenseUrl: licenses[0] && licenses[0].URL ? String(licenses[0].URL) : null,
      identifiers,
      tags: [],
      categories: it.type ? [String(it.type)] : [],
      authors,
      journal: noValue(containers[0], null),
      publicationDate: datePartsToString(it.published || it.created),
      citations: it['is-referenced-by-count'],
      doi: it.DOI ? String(it.DOI) : null,
      url: noValue(it.URL, null) || doiUrl,
      openAccess: false,
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
        detail: `search probe returned ${rows.length} result(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new CrossrefSource(deps, meta),
};
