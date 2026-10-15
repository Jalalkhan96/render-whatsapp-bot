/*
 * sources/research/doaj.cjs — Directory of Open Access Journals adapter.
 *
 * API: https://doaj.org/api/search/articles/<q>?pageSize=20
 * Docs: https://doaj.org/api/docs
 * bibjson carries title, abstract, author[].name, year, journal.title,
 * identifier[] (doi/url/issn), keywords and license. DOAJ lists only
 * open-access journals, so openAccess is true for all results. No key required.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { research } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'doaj',
  name: 'DOAJ',
  category: 'research',
  transport: 'api',
  baseUrl: 'https://doaj.org/api',
  docsUrl: 'https://doaj.org/api/docs',
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
  priority: 8,
  description:
    'DOAJ open-access journal article search: titles, abstracts, authors, ' +
    'journals, years, DOIs and licenses. All listed content is open access. ' +
    'No key required.',
};

class DoajSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const url = this._buildUrl(`https://doaj.org/api/search/articles/${encodeURIComponent(String(query))}`, {
        pageSize: limit,
      });
      const data = await this.getJson(url);
      const results = (data && Array.isArray(data.results)) ? data.results : [];
      return results.map((r) => this._toResult(r && r.bibjson, r && r.id)).filter((x) => x.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(bib, docId) {
    bib = bib || {};
    const authorsRaw = Array.isArray(bib.author) ? bib.author : [];
    const authors = authorsRaw.map((a) => a && a.name).filter((n) => typeof n === 'string' && n.trim() !== '');
    const idents = Array.isArray(bib.identifier) ? bib.identifier : [];
    const pickIdent = (t) => {
      const hit = idents.find((i) => i && String(i.type).toLowerCase() === t);
      return hit && hit.id ? String(hit.id) : null;
    };
    const doi = pickIdent('doi');
    const urlIdent = pickIdent('url');
    const issn = [pickIdent('issn'), pickIdent('eissn')].filter(Boolean);
    const journal = bib.journal || {};
    const licenses = Array.isArray(bib.license) ? bib.license : [];
    const lic = licenses[0] || {};
    const identifiers = {};
    if (doi) identifiers.doi = doi;
    if (issn.length > 0) identifiers.issn = issn;
    const year = bib.year != null ? String(bib.year) : null;
    return research({
      id: docId || doi || null,
      source: this.id,
      sourceId: docId || null,
      sourceUrl: urlIdent || (doi ? `https://doi.org/${doi}` : null),
      title: noValue(bib.title, null),
      description: noValue(bib.abstract, null),
      type: 'research',
      creator: authors[0] || null,
      date: year,
      language: noValue(bib.language, null),
      license: noValue(lic.type, null),
      licenseUrl: noValue(lic.url, null),
      identifiers,
      tags: Array.isArray(bib.keywords) ? bib.keywords.filter((k) => typeof k === 'string') : [],
      categories: [],
      authors,
      journal: noValue(journal.title, null),
      publicationDate: year,
      citations: 0,
      doi,
      url: urlIdent || (doi ? `https://doi.org/${doi}` : null),
      openAccess: true, // DOAJ indexes open-access journals only.
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
        detail: `API probe returned ${rows.length} result(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new DoajSource(deps, meta),
};
