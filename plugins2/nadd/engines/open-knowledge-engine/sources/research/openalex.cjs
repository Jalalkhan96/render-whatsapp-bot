/*
 * sources/research/openalex.cjs — OpenAlex scholarly works adapter.
 *
 * API: https://api.openalex.org/works?search=<q>&per-page=20
 * Docs: https://docs.openalex.org/
 * No API key required. Optional mailto param (OPENALEX_EMAIL) for politeness.
 * Abstracts are returned as an inverted index (abstract_inverted_index) and
 * are reconstructed into plain text here (§75: API-provided text only).
 */
'use strict';

const { BaseKnowledgeSource, pickFirst, noValue } = require('../../core/base-source.cjs');
const { research } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'openalex',
  name: 'OpenAlex',
  category: 'research',
  transport: 'api',
  baseUrl: 'https://api.openalex.org',
  docsUrl: 'https://docs.openalex.org/',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: ['OPENALEX_EMAIL'],
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
  priority: 1,
  description:
    'OpenAlex open catalog of scholarly works: title, authors, abstract ' +
    '(reconstructed from the inverted index), DOI, journal, publication date, ' +
    'citation counts and open-access flags. No key required.',
};

function reconstructAbstract(invertedIndex) {
  // §75: rebuild the API-provided abstract_inverted_index into plain text.
  if (!invertedIndex || typeof invertedIndex !== 'object') return null;
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) words[Number(p)] = word;
  }
  const text = words.filter((w) => typeof w === 'string').join(' ');
  return text.length > 0 ? text : null;
}

function bareDoi(doiUrl) {
  if (typeof doiUrl !== 'string') return null;
  return doiUrl.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim() || null;
}

class OpenAlexSource extends BaseKnowledgeSource {
  constructor(deps, m) {
    super(deps, m || meta);
  }

  _email() {
    return (this.deps && this.deps.OPENALEX_EMAIL) || process.env.OPENALEX_EMAIL || null;
  }

  async search(query, options) {
    options = options || {};
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 25);
    try {
      const params = { search: String(query), 'per-page': limit };
      const email = this._email();
      if (email) params.mailto = email;
      const url = this._buildUrl('https://api.openalex.org/works', params);
      const data = await this.getJson(url);
      const works = (data && Array.isArray(data.results)) ? data.results : [];
      return works.map((w) => this._toResult(w)).filter((r) => r.title != null);
    } catch (_err) {
      return [];
    }
  }

  _toResult(w) {
    w = w || {};
    const doiUrl = noValue(w.doi, null);
    const doi = bareDoi(doiUrl);
    const authorships = Array.isArray(w.authorships) ? w.authorships : [];
    const authors = authorships
      .map((a) => a && a.author && a.author.display_name)
      .filter((n) => typeof n === 'string' && n.trim() !== '');
    const primaryLoc = w.primary_location || {};
    const source = primaryLoc.source || {};
    const oa = w.open_access || {};
    const ids = w.ids || {};
    const licenseRaw = noValue(w.license, null);
    const concepts = Array.isArray(w.concepts) ? w.concepts : [];
    const identifiers = {};
    if (w.id) identifiers.openalex = String(w.id);
    if (doi) identifiers.doi = doi;
    if (ids.pmid) identifiers.pmid = String(ids.pmid);
    if (ids.pmcid) identifiers.pmcid = String(ids.pmcid);
    if (ids.mag) identifiers.mag = String(ids.mag);
    const pdfUrl = noValue(primaryLoc.pdf_url, null);
    const landingUrl = noValue(primaryLoc.landing_page_url, null);
    return research({
      id: w.id || null,
      source: this.id,
      sourceId: w.id ? String(w.id).replace('https://openalex.org/', '') : null,
      sourceUrl: doiUrl || w.id || null,
      title: noValue(w.display_name, null),
      description: reconstructAbstract(w.abstract_inverted_index),
      type: 'research',
      creator: authors[0] || null,
      date: noValue(w.publication_date, null),
      language: noValue(w.language, null),
      contentUrl: pdfUrl,
      license: licenseRaw,
      licenseUrl: typeof licenseRaw === 'string' && /^https?:\/\//i.test(licenseRaw) ? licenseRaw : null,
      identifiers,
      tags: concepts.slice(0, 5).map((c) => c && c.display_name).filter(Boolean),
      categories: w.type ? [String(w.type)] : [],
      authors,
      journal: noValue(source.display_name, null),
      publicationDate: noValue(w.publication_date, null),
      citations: w.cited_by_count,
      doi,
      url: doiUrl || w.id || landingUrl,
      openAccess: oa.is_oa === true,
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
  createSource: (deps) => new OpenAlexSource(deps, meta),
};
