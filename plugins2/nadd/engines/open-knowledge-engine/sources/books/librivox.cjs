/*
 * sources/books/librivox.cjs — LibriVox adapter (GROUP B).
 *
 * Transport: api. Official audiobook feed API (JSON), live-verified
 * 2026-10-05:
 *   https://librivox.org/api/feed/audiobooks/?q=<q>&format=json
 * Record fields: id, title, description (HTML — tags stripped), authors
 * [{first_name, last_name, dob, dod}], language, copyright_year,
 * num_sections, url_librivox, url_rss, url_zip_file, totaltime.
 * LibriVox recordings are public domain; only links are exposed, no
 * download restrictions are bypassed.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');
const { book } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'librivox',
  name: 'LibriVox',
  category: 'books',
  transport: 'api',
  baseUrl: 'https://librivox.org',
  docsUrl: 'https://librivox.org/api/info',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: false, images: false, documents: false,
    downloads: true, api: true, bulk: false, coordinates: false, license: true,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 20, delayMs: 3000, maxPages: 5, maxResults: 20 },
  priority: 35,
  description: 'LibriVox public-domain audiobook catalog API. Searches by title/author; exposes catalog links (RSS/zip/page) only. All recordings are public domain.',
};

function stripHtml(s) {
  if (s == null) return null;
  const t = String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return t || null;
}

class LibrivoxSource extends BaseKnowledgeSource {
  _authorName(a) {
    if (!a) return null;
    const parts = [a.first_name, a.last_name].filter((p) => p && String(p).trim());
    return parts.length ? parts.join(' ') : null;
  }

  _mapBook(b) {
    const id = b.id != null ? String(b.id) : null;
    const authors = (Array.isArray(b.authors) ? b.authors : []).map((a) => this._authorName(a)).filter(Boolean);
    const zip = b.url_zip_file || null;
    return {
      id: id ? `librivox:${id}` : null,
      sourceId: id,
      sourceUrl: b.url_librivox || null,
      title: b.title || null,
      description: stripHtml(b.description),
      type: 'book',
      creator: authors.length ? authors.join(', ') : null,
      date: b.copyright_year != null ? String(b.copyright_year) : null,
      language: b.language || null,
      contentUrl: b.url_rss || b.url_librivox || null,
      thumbnailUrl: null,
      license: 'public-domain',
      licenseUrl: 'https://librivox.org/pages/public-domain/',
      rights: 'public-domain',
      identifiers: { librivox: id },
      categories: ['librivox', 'audiobook'],
      author: authors,
      publicationDate: b.copyright_year != null ? String(b.copyright_year) : null,
      downloadAvailable: zip != null,
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    options = options || {};
    const max = (this.meta.rateLimit && this.meta.rateLimit.maxResults) || 20;
    const limit = Math.min(Math.max(Number(options.limit) || max, 1), max);
    const url = this._buildUrl('https://librivox.org/api/feed/audiobooks/', {
      q: String(query).trim(), format: 'json',
    });
    const data = await this.getJson(url);
    const books = data && Array.isArray(data.books) ? data.books : [];
    return books.slice(0, limit).map((b) => book(Object.assign({ source: this.id }, this._mapBook(b))))
      .filter((r) => r.title != null || r.id != null);
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const data = await this.getJson(this._buildUrl('https://librivox.org/api/feed/audiobooks/', { q: 'test', format: 'json' }), { timeoutMs: 15000 });
      const ok = data && Array.isArray(data.books);
      return { id: this.id, status: ok ? 'ok' : 'error', latencyMs: Date.now() - t0, detail: ok ? 'audiobooks feed API reachable' : 'unexpected API response' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 160) };
    }
  }
}

module.exports = { meta, createSource: (deps) => new LibrivoxSource(deps, meta) };
