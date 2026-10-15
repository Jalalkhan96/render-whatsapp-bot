/*
 * sources/research/semanticscholar.cjs — Semantic Scholar Graph API adapter.
 *
 * API: https://api.semanticscholar.org/graph/v1/paper/search
 *        ?query=<q>&limit=20&fields=title,abstract,authors,year,venue,externalIds,url,openAccessPdf,citationCount
 * Docs: https://api.semanticscholar.org/graph/v1
 * STRICT rate limit: 1 request / 2s unauthenticated (requestsPerMinute 30 +
 * delayMs 2000). Optional SEMANTIC_SCHOLAR_KEY raises limits (x-api-key).
 * Abstracts are often omitted by the API — left null when absent (§75).
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { research } = require('../../core/metadata-normalizer.cjs');

const FIELDS = 'title,abstract,authors,year,venue,externalIds,url,openAccessPdf,citationCount';

const meta = {
  id: 'semanticscholar',
  name: 'Semantic Scholar',
  category: 'research',
  transport: 'api',
  baseUrl: 'https://api.semanticscholar.org',
  docsUrl: 'https://api.semanticscholar.org/graph/v1',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: ['SEMANTIC_SCHOLAR_KEY'],
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
  // STRICT: unauthenticated callers get ~1 request per 2 seconds.
  rateLimit: { requestsPerMinute: 30, delayMs: 2000 },
  priority: 3,
  description:
    'Semantic Scholar paper search: titles, authors, venue, year, citation ' +
    'counts, external IDs and open-access PDF links. Abstracts are frequently ' +
    'omitted by the API and left null. Strict 1 req / 2s rate limit.',
};

class SemanticScholarSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  _key() {
    return (this.deps && this.deps.SEMANTIC_SCHOLAR_KEY) || process.env.SEMANTIC_SCHOLAR_KEY || null;
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const params = { query: String(query), limit, fields: FIELDS };
      const url = this._buildUrl('https://api.semanticscholar.org/graph/v1/paper/search', params);
      const opts = {};
      const key = this._key();
      if (key) opts.headers = { 'x-api-key': key };
      const data = await this.getJson(url, opts);
      const papers = (data && Array.isArray(data.data)) ? data.data : [];
      return papers.map((p) => this._toResult(p)).filter((r) => r.title != null);
    } catch (_err) {
      // 429s and outages return [] — never fabricated results.
      return [];
    }
  }

  _toResult(p) {
    p = p || {};
    const authorsRaw = Array.isArray(p.authors) ? p.authors : [];
    const authors = authorsRaw.map((a) => a && a.name).filter((n) => typeof n === 'string' && n.trim() !== '');
    const ext = p.externalIds || {};
    const pdf = p.openAccessPdf || {};
    const identifiers = {};
    if (p.paperId) identifiers.semanticscholar = String(p.paperId);
    if (ext.DOI) identifiers.doi = String(ext.DOI);
    if (ext.ArXiv) identifiers.arxiv = String(ext.ArXiv);
    if (ext.PMID) identifiers.pmid = String(ext.PMID);
    if (ext.MAG) identifiers.mag = String(ext.MAG);
    const doi = ext.DOI ? String(ext.DOI) : null;
    const pdfUrl = noValue(pdf.url, null);
    return research({
      id: p.paperId || doi || null,
      source: this.id,
      sourceId: p.paperId || null,
      sourceUrl: pdfUrl || noValue(p.url, null) || (doi ? `https://doi.org/${doi}` : null),
      title: noValue(p.title, null),
      description: noValue(p.abstract, null),
      type: 'research',
      creator: authors[0] || null,
      date: p.year != null ? String(p.year) : null,
      contentUrl: pdfUrl,
      identifiers,
      tags: [],
      categories: [],
      authors,
      journal: noValue(p.venue, null),
      publicationDate: p.year != null ? String(p.year) : null,
      citations: p.citationCount,
      doi,
      url: pdfUrl || noValue(p.url, null),
      openAccess: pdfUrl != null,
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
        detail: `search probe returned ${rows.length} result(s); strict 1 req/2s limit enforced`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new SemanticScholarSource(deps, meta),
};
