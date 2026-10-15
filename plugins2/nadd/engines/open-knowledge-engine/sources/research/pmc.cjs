/*
 * sources/research/pmc.cjs — PubMed Central (PMC) E-utilities adapter.
 *
 * Same E-utilities endpoints as PubMed but with db=pmc. PMC hosts the
 * full text of the articles, so fullText is true and contentUrl points at
 * the article page. No key required.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { research } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'pmc',
  name: 'PubMed Central',
  category: 'research',
  transport: 'api',
  baseUrl: 'https://eutils.ncbi.nlm.nih.gov',
  docsUrl: 'https://www.ncbi.nlm.nih.gov/books/NBK25499/',
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
    license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 500 },
  priority: 6,
  description:
    'PubMed Central full-text biomedical archive via NCBI E-utilities ' +
    '(esearch + esummary): titles, authors, journals, dates and article links. ' +
    'No key required.',
};

class PmcSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const searchUrl = this._buildUrl('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', {
        db: 'pmc',
        term: String(query),
        retmax: limit,
        retmode: 'json',
        tool: 'open-knowledge-engine',
      });
      const sdata = await this.getJson(searchUrl);
      const idlist = (sdata && sdata.esearchresult && Array.isArray(sdata.esearchresult.idlist))
        ? sdata.esearchresult.idlist
        : [];
      if (idlist.length === 0) return [];
      const summaryUrl = this._buildUrl('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi', {
        db: 'pmc',
        id: idlist.join(','),
        retmode: 'json',
        tool: 'open-knowledge-engine',
      });
      const edata = await this.getJson(summaryUrl);
      const res = (edata && edata.result) || {};
      const uids = Array.isArray(res.uids) ? res.uids : [];
      return uids.map((uid) => this._toResult(res[uid], uid)).filter((r) => r.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(rec, uid) {
    rec = rec || {};
    const authorsRaw = Array.isArray(rec.authors) ? rec.authors : [];
    const authors = authorsRaw.map((a) => a && a.name).filter((n) => typeof n === 'string' && n.trim() !== '');
    const pmcid = uid ? `PMC${uid}` : null;
    const identifiers = {};
    if (pmcid) identifiers.pmcid = pmcid;
    const url = pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : null;
    return research({
      id: pmcid || null,
      source: this.id,
      sourceId: pmcid || null,
      sourceUrl: url,
      title: noValue(rec.title, null),
      description: null, // esummary provides no abstract.
      type: 'research',
      creator: authors[0] || null,
      date: noValue(rec.pubdate, null),
      contentUrl: url,
      identifiers,
      tags: [],
      categories: [],
      authors,
      journal: noValue(rec.source, null),
      publicationDate: noValue(rec.pubdate, null),
      citations: 0,
      doi: null,
      url,
      openAccess: true, // PMC is a full-text open archive.
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
        detail: `E-utilities probe returned ${rows.length} result(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new PmcSource(deps, meta),
};
