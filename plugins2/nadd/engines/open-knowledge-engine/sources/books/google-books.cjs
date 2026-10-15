/*
 * sources/books/google-books.cjs — Google Books adapter (GROUP B).
 *
 * Transport: api. Official Google Books Volumes API (JSON):
 *   GET https://www.googleapis.com/books/v1/volumes?q=<q>&maxResults=N
 * Implements the documented volumeInfo schema (title, authors, publisher,
 * publishedDate, description, industryIdentifiers, language, imageLinks,
 * infoLink, previewLink). No API key is needed for low-volume use.
 * NOTE: googleapis.com timed out twice from this build environment on
 * 2026-10-05 (no bytes received); the endpoint shape follows the public
 * API documentation. We only expose infoLink/previewLink — full-view status
 * and preview/download restrictions are never bypassed.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');
const { book } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'google-books',
  name: 'Google Books',
  category: 'books',
  transport: 'api',
  baseUrl: 'https://www.googleapis.com/books/v1',
  docsUrl: 'https://developers.google.com/books/docs/v1/using',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: false, images: true, documents: false,
    downloads: false, api: true, bulk: false, coordinates: false, license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 15, delayMs: 4000, maxPages: 5, maxResults: 20 },
  priority: 25,
  description: 'Google Books Volumes API metadata search (no key, low volume). Exposes metadata, cover thumbnails, and info/preview links only; preview and download restrictions are respected, never bypassed.',
};

function pickIsbn(industryIdentifiers) {
  const ids = Array.isArray(industryIdentifiers) ? industryIdentifiers : [];
  let isbn13 = null, isbn10 = null;
  for (const ii of ids) {
    if (!ii || !ii.identifier) continue;
    if (ii.type === 'ISBN_13') isbn13 = isbn13 || ii.identifier;
    else if (ii.type === 'ISBN_10') isbn10 = isbn10 || ii.identifier;
  }
  return isbn13 || isbn10 || null;
}

class GoogleBooksSource extends BaseKnowledgeSource {
  _mapItem(item) {
    const vi = (item && item.volumeInfo) || {};
    const id = item && item.id ? item.id : null;
    const authors = Array.isArray(vi.authors) ? vi.authors.filter((a) => a && String(a).trim()) : [];
    const isbn = pickIsbn(vi.industryIdentifiers);
    const thumb = vi.imageLinks && (vi.imageLinks.thumbnail || vi.imageLinks.smallThumbnail)
      ? String(vi.imageLinks.thumbnail || vi.imageLinks.smallThumbnail).replace(/^http:/, 'https:') : null;
    return {
      id: id ? `google-books:${id}` : null,
      sourceId: id,
      sourceUrl: vi.infoLink || null,
      title: vi.title || null,
      description: vi.description || null,
      type: 'book',
      creator: authors.length ? authors.join(', ') : null,
      date: vi.publishedDate || null,
      language: vi.language || null,
      contentUrl: vi.previewLink || vi.infoLink || null, // preview link only; never a download bypass
      thumbnailUrl: thumb,
      license: 'unknown',
      rights: 'unknown',
      identifiers: { googleBooks: id, isbn },
      tags: Array.isArray(vi.categories) ? vi.categories : [],
      categories: ['google-books'],
      author: authors,
      publisher: vi.publisher || null,
      publicationDate: vi.publishedDate || null,
      isbn: isbn ? [isbn] : [],
      pageCount: vi.pageCount != null ? vi.pageCount : null,
      downloadAvailable: false,
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    options = options || {};
    const max = (this.meta.rateLimit && this.meta.rateLimit.maxResults) || 20;
    const limit = Math.min(Math.max(Number(options.limit) || max, 1), max);
    const url = this._buildUrl('https://www.googleapis.com/books/v1/volumes', {
      q: String(query).trim(), maxResults: limit, printType: 'books', orderBy: 'relevance',
    });
    const data = await this.getJson(url);
    const items = data && Array.isArray(data.items) ? data.items : [];
    return items.slice(0, limit).map((it) => book(Object.assign({ source: this.id }, this._mapItem(it))))
      .filter((r) => r.title != null || r.id != null);
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const data = await this.getJson(this._buildUrl('https://www.googleapis.com/books/v1/volumes', { q: 'test', maxResults: 1 }), { timeoutMs: 15000 });
      const ok = data && (Array.isArray(data.items) || typeof data.totalItems === 'number');
      return { id: this.id, status: ok ? 'ok' : 'error', latencyMs: Date.now() - t0, detail: ok ? 'volumes API reachable' : 'unexpected API response' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 160) };
    }
  }
}

module.exports = { meta, createSource: (deps) => new GoogleBooksSource(deps, meta) };
