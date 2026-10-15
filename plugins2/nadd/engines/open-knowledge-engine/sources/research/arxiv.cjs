/*
 * sources/research/arxiv.cjs — arXiv ATOM API adapter.
 *
 * API: https://export.arxiv.org/api/query?search_query=all:<q>&max_results=20
 * Docs: https://info.arxiv.org/help/api/index.html
 * ATOM XML parsed with regexes (zero deps). Plain https:// (plain http failed
 * in verification). All arXiv papers are open access; PDF links provided.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { research } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'arxiv',
  name: 'arXiv',
  category: 'research',
  transport: 'api',
  baseUrl: 'https://export.arxiv.org',
  docsUrl: 'https://info.arxiv.org/help/api/index.html',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true,
    metadata: true,
    fullText: true,
    documents: true,
    api: true,
    bulk: false,
    license: true,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 500 },
  priority: 4,
  description:
    'arXiv preprint search via the ATOM API: titles, authors, abstracts, ' +
    'categories, publication dates and open-access PDF links. No key required.',
};

function clean(s) {
  if (typeof s !== 'string') return null;
  const t = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

function tagValue(entry, tag) {
  const m = entry.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
  return m ? clean(m[1]) : null;
}

function arxivIdFrom(idUrl) {
  if (typeof idUrl !== 'string') return null;
  const m = idUrl.match(/\/abs\/([^\s<]+)/);
  return m ? m[1] : null;
}

class ArxivSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const params = {
        search_query: 'all:' + String(query),
        start: 0,
        max_results: limit,
        sortBy: 'relevance',
        sortOrder: 'descending',
      };
      const url = this._buildUrl('https://export.arxiv.org/api/query', params);
      const xml = await this.getText(url);
      const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
      return entries.map((e) => this._toResult(e)).filter((r) => r.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(entry) {
    const idUrl = tagValue(entry, 'id');
    const arxivId = arxivIdFrom(idUrl);
    const authors = [];
    const authorBlocks = entry.match(/<author>[\s\S]*?<\/author>/g) || [];
    for (const ab of authorBlocks) {
      const n = tagValue(ab, 'name');
      if (n) authors.push(n);
    }
    const catTerms = [];
    const catMatches = entry.match(/<category\s+term="([^"]+)"/g) || [];
    for (const cm of catMatches) {
      const t = cm.match(/term="([^"]+)"/);
      if (t) catTerms.push(t[1]);
    }
    const journalRef = tagValue(entry, 'arxiv:journal_ref');
    const absUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : idUrl;
    const pdfUrl = arxivId ? `https://arxiv.org/pdf/${arxivId}` : null;
    const published = tagValue(entry, 'published');
    const identifiers = {};
    if (arxivId) identifiers.arxiv = arxivId;
    return research({
      id: arxivId || idUrl,
      source: this.id,
      sourceId: arxivId || idUrl,
      sourceUrl: absUrl,
      title: tagValue(entry, 'title'),
      description: tagValue(entry, 'summary'),
      type: 'research',
      creator: authors[0] || null,
      date: published,
      contentUrl: pdfUrl,
      identifiers,
      tags: catTerms,
      categories: catTerms.length > 0 ? [catTerms[0]] : [],
      authors,
      journal: journalRef,
      publicationDate: published,
      citations: 0,
      doi: null,
      url: absUrl,
      openAccess: true, // arXiv is an open-access preprint server.
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
        detail: `ATOM probe returned ${rows.length} result(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new ArxivSource(deps, meta),
};
