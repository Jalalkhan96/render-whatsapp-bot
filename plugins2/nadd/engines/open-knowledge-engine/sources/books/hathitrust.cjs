/*
 * sources/books/hathitrust.cjs — HathiTrust Bibliographic API adapter (GROUP B).
 *
 * Transport: api, status: limited. Live-verified 2026-10-05:
 *   GET https://catalog.hathitrust.org/api/volumes/<brief|full>/<idtype>/<id>.json
 * The bib API supports IDENTIFIER lookups only (isbn / oclc / lccn / issn /
 * htid / recordnumber); there is NO keyword-search endpoint — both
 * `/api/volumes?q=...` and `/api/volumes/search?q=...` return HTTP 404, and
 * the catalog HTML search is Cloudflare-protected. search() therefore
 * resolves identifier-shaped queries through the official API and returns
 * [] for free-text queries (never fabricated). This limitation is reported
 * honestly via healthCheck detail and the adapter description.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');
const { book } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'hathitrust',
  name: 'HathiTrust Digital Library',
  category: 'books',
  transport: 'api',
  baseUrl: 'https://catalog.hathitrust.org',
  docsUrl: 'https://www.hathitrust.org/member-libraries/resources-for-librarians/data-resources/bibliographic-api/',
  implemented: true,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: false, images: false, documents: false,
    downloads: false, api: true, bulk: false, coordinates: false, license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 20, delayMs: 3000, maxPages: 5, maxResults: 20 },
  priority: 60,
  description: 'HathiTrust Bibliographic API (official). Supports identifier lookups only (ISBN, OCLC, LCCN, HathiTrust record number, volume ID) — the API offers no free-text keyword search, so plain-text queries return no results rather than fabricated ones.',
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

class HathiTrustSource extends BaseKnowledgeSource {
  // Detect identifier-shaped queries; return [idType, value] or null.
  _detectIdentifier(q) {
    const s = String(q || '').trim();
    if (!s) return null;
    let m = s.match(/^(?:isbn|oclc|lccn|issn|recordnumber)[:\s]+(.+)$/i);
    const prefixed = m ? m[1].trim() : null;
    const kind = m ? m[0].split(/[:\s]/)[0].toLowerCase() : null;
    if (prefixed) {
      if (kind === 'isbn') {
        const d = prefixed.replace(/[-\s]/g, '');
        if (/^(?:\d{10}|\d{9}[0-9Xx]|\d{13})$/.test(d)) return ['isbn', d];
        return null;
      }
      if (kind === 'oclc') {
        const d = prefixed.replace(/\D/g, '');
        if (d) return ['oclc', d];
        return null;
      }
      if (kind === 'recordnumber' && /^\d{9}$/.test(prefixed)) return ['recordnumber', prefixed];
      if (kind === 'lccn' && prefixed) return ['lccn', prefixed];
      if (kind === 'issn') {
        const d = prefixed.replace(/[-\s]/g, '');
        if (/^\d{8}$/.test(d) || /^\d{7}[0-9Xx]$/.test(d)) return ['issn', d];
        return null;
      }
      return null;
    }
    if (/^\d{9}$/.test(s)) return ['recordnumber', s]; // 9-digit HT record number
    const digits = s.replace(/[-\s]/g, '');
    if (/^(?:\d{10}|\d{9}[0-9Xx]|\d{13})$/.test(digits)) return ['isbn', digits];
    return null;
  }

  _mapRecord(recnum, rec) {
    const title = first(rec.titles);
    const sourceUrl = first(rec.recordURL) || `https://catalog.hathitrust.org/Record/${recnum}`;
    return {
      id: `hathitrust:${recnum}`,
      sourceId: recnum,
      sourceUrl,
      title,
      description: null,
      type: 'book',
      creator: null,
      date: first(rec.publishDates),
      language: null,
      contentUrl: sourceUrl,
      thumbnailUrl: null,
      license: 'unknown',
      rights: 'unknown',
      identifiers: {
        htid: null,
        hathitrust: recnum,
        isbn: first(rec.isbns),
        oclc: first(rec.oclcs),
        lccn: first(rec.lccns),
      },
      categories: ['hathitrust'],
      isbn: first(rec.isbns) ? [first(rec.isbns)] : [],
      publicationDate: first(rec.publishDates),
      downloadAvailable: false,
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    const idq = this._detectIdentifier(query);
    if (!idq) return []; // no keyword search on the bib API — never fabricate
    options = options || {};
    const max = (this.meta.rateLimit && this.meta.rateLimit.maxResults) || 20;
    const limit = Math.min(Math.max(Number(options.limit) || max, 1), max);
    const [idType, value] = idq;
    const url = `https://catalog.hathitrust.org/api/volumes/brief/${encodeURIComponent(idType)}/${encodeURIComponent(value)}.json`;
    let data;
    try {
      data = await this.getJson(url, { timeoutMs: 20000 });
    } catch (err) {
      // 404 = identifier not found: honest empty result, not an error.
      if (err && err.info && err.info.status === 404) return [];
      throw err;
    }
    const records = data && data.records && typeof data.records === 'object' ? data.records : {};
    return Object.entries(records).slice(0, limit).map(([recnum, rec]) =>
      book(Object.assign({ source: this.id }, this._mapRecord(recnum, rec || {}))))
      .filter((r) => r.title != null || r.id != null);
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      // Known-good identifier probe (Tale of Two Cities ISBN, verified live).
      const data = await this.getJson('https://catalog.hathitrust.org/api/volumes/brief/isbn/9780141439600.json', { timeoutMs: 15000 });
      const ok = data && data.records && Object.keys(data.records).length > 0;
      return {
        id: this.id, status: ok ? 'ok' : 'error', latencyMs: Date.now() - t0,
        detail: ok ? 'bib API reachable (identifier lookups only; no keyword search endpoint)' : 'identifier probe returned no records',
      };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 160) };
    }
  }
}

module.exports = { meta, createSource: (deps) => new HathiTrustSource(deps, meta) };
