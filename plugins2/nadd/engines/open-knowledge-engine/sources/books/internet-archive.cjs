/*
 * sources/books/internet-archive.cjs — Internet Archive adapter (GROUP B).
 *
 * Transport: api. Official Advanced Search API (JSON):
 *   https://archive.org/advancedsearch.php?q=<q>&fl[]=...&rows=N&output=json
 * Live-verified 2026-10-05 (docs array with identifier/title/creator/date/
 * description/mediatype). Rate-limited gently (§101): 30 rpm, 2s delay.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');
const { book } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'internet-archive',
  name: 'Internet Archive',
  category: 'archive',
  transport: 'api',
  baseUrl: 'https://archive.org',
  docsUrl: 'https://archive.org/advancedsearch.php',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: true, images: true, documents: true,
    downloads: true, api: true, bulk: true, coordinates: false, license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 2000, maxPages: 5, maxResults: 20 },
  priority: 40,
  description: 'Internet Archive full-text/library search via the official Advanced Search JSON API. Polite rate limiting; metadata + cover + download links only, no access-control bypass.',
};

function first(v) {
  if (Array.isArray(v)) {
    for (const x of v) {
      if (x !== undefined && x !== null && String(x).trim() !== '') return x;
    }
    return null;
  }
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return null;
  return v;
}

class InternetArchiveSource extends BaseKnowledgeSource {
  _mapDoc(d) {
    const identifier = first(d.identifier);
    return {
      id: identifier ? `internet-archive:${identifier}` : null,
      sourceId: identifier,
      sourceUrl: identifier ? `https://archive.org/details/${identifier}` : null,
      title: first(d.title),
      description: first(d.description),
      type: 'book',
      creator: first(d.creator),
      date: first(d.date),
      language: first(d.language),
      contentUrl: identifier ? `https://archive.org/download/${identifier}` : null,
      thumbnailUrl: identifier ? `https://archive.org/services/img/${identifier}` : null,
      license: 'unknown',
      rights: 'unknown',
      identifiers: { ia: identifier },
      tags: d.mediatype ? [first(d.mediatype)].filter(Boolean) : [],
      categories: ['internet-archive', d.mediatype || ''].filter(Boolean),
      author: first(d.creator),
      publicationDate: first(d.date),
      downloadAvailable: first(d.mediatype) === 'texts',
    };
  }

  _finalize(partials) {
    return partials
      .map((p) => book(Object.assign({ source: this.id }, p)))
      .filter((r) => r.title != null || r.id != null);
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    options = options || {};
    const max = (this.meta.rateLimit && this.meta.rateLimit.maxResults) || 20;
    const limit = Math.min(Math.max(Number(options.limit) || max, 1), max);
    const url = this._buildUrl('https://archive.org/advancedsearch.php', {
      q: String(query).trim(),
      'fl[]': ['identifier', 'title', 'creator', 'date', 'description', 'mediatype', 'language'],
      rows: limit,
      output: 'json',
    });
    let data;
    try {
      data = await this.getJson(url);
    } catch (err) {
      if (err && (err.name === 'KnowledgeHttpError')) throw err;
      throw err;
    }
    const docs = data && data.response && Array.isArray(data.response.docs) ? data.response.docs : [];
    return this._finalize(docs.slice(0, limit).map((d) => this._mapDoc(d)));
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const data = await this.getJson(this._buildUrl('https://archive.org/advancedsearch.php', {
        q: 'open knowledge engine', 'fl[]': ['identifier'], rows: 1, output: 'json',
      }), { timeoutMs: 15000 });
      const ok = data && data.responseHeader && data.responseHeader.status === 0;
      return { id: this.id, status: ok ? 'ok' : 'error', latencyMs: Date.now() - t0, detail: ok ? 'advancedsearch.php reachable' : 'unexpected API response' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 160) };
    }
  }
}

module.exports = { meta, createSource: (deps) => new InternetArchiveSource(deps, meta) };
