/*
 * sources/research/europepmc.cjs — Europe PMC REST search adapter.
 *
 * API: https://www.ebi.ac.uk/europepmc/webservices/rest/search
 *      ?query=<q>&format=json&pageSize=20
 * Docs: https://www.ebi.ac.uk/europepmc/webservices/rest
 * resultList.result[] carries title, authorString, journalInfo, doi, pmid,
 * pmcid, abstractText, isOpenAccess, license and fullTextUrlList.
 * No key required.
 */
'use strict';

const { BaseKnowledgeSource, noValue } = require('../../core/base-source.cjs');
const { research } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'europepmc',
  name: 'Europe PMC',
  category: 'research',
  transport: 'api',
  baseUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest',
  docsUrl: 'https://www.ebi.ac.uk/europepmc/webservices/rest',
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
    citations: true,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 500 },
  priority: 7,
  description:
    'Europe PMC life-sciences literature search: titles, authors, abstracts, ' +
    'DOIs, PMIDs, open-access flags, licenses and full-text links. No key required.',
};

function splitAuthors(authorString) {
  if (typeof authorString !== 'string') return [];
  return authorString
    .split(/\s*,\s*/)
    .map((a) => a.replace(/\.$/, '').trim())
    .filter((a) => a !== '');
}

class EuropePmcSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const url = this._buildUrl('https://www.ebi.ac.uk/europepmc/webservices/rest/search', {
        query: String(query),
        format: 'json',
        pageSize: limit,
        resultType: 'core',
      });
      const data = await this.getJson(url);
      const results = (data && data.resultList && Array.isArray(data.resultList.result))
        ? data.resultList.result
        : [];
      return results.map((r) => this._toResult(r)).filter((x) => x.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(r) {
    r = r || {};
    const authors = splitAuthors(r.authorString);
    const journalInfo = r.journalInfo || {};
    const journal = journalInfo.journal || {};
    const ftUrls = (r.fullTextUrlList && Array.isArray(r.fullTextUrlList.fullTextUrl))
      ? r.fullTextUrlList.fullTextUrl
      : [];
    const ftUrl = ftUrls[0] && ftUrls[0].url ? String(ftUrls[0].url) : null;
    const doi = noValue(r.doi, null);
    const identifiers = {};
    if (doi) identifiers.doi = doi;
    if (r.pmid) identifiers.pmid = String(r.pmid);
    if (r.pmcid) identifiers.pmcid = String(r.pmcid);
    const sourceUrl = doi ? `https://doi.org/${doi}` : ftUrl;
    const cites = Number(r.citedByCount);
    return research({
      id: r.id || identifiers.pmid || identifiers.pmcid || null,
      source: this.id,
      sourceId: r.id || null,
      sourceUrl,
      title: noValue(r.title, null),
      description: noValue(r.abstractText, null),
      type: 'research',
      creator: authors[0] || null,
      date: noValue(r.firstPublicationDate, null),
      language: noValue(r.language, null),
      contentUrl: ftUrl,
      license: noValue(r.license, null),
      identifiers,
      tags: [],
      categories: [],
      authors,
      journal: noValue(journal.title, null),
      publicationDate: noValue(r.firstPublicationDate || journalInfo.printPublicationDate, null),
      citations: Number.isFinite(cites) ? cites : 0,
      doi,
      url: sourceUrl,
      openAccess: r.isOpenAccess === 'Y',
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
        detail: `REST probe returned ${rows.length} result(s)`,
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

module.exports = {
  meta,
  createSource: (deps) => new EuropePmcSource(deps, meta),
};
