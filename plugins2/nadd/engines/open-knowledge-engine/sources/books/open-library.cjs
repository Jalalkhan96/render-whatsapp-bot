/*
 * sources/books/open-library.cjs — Open Library adapter (GROUP B).
 *
 * Transport: api. Official search API (JSON), live-verified 2026-10-05:
 *   https://openlibrary.org/search.json?q=<q>&limit=N
 * Record fields: key, title, author_name, first_publish_year, isbn, cover_i,
 * publisher, language, ebook_access, ia.
 * Open Library asks clients to identify the app (done via the shared
 * User-Agent) and to cache aggressively — see description.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');
const { book } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'open-library',
  name: 'Open Library',
  category: 'books',
  transport: 'api',
  baseUrl: 'https://openlibrary.org',
  docsUrl: 'https://openlibrary.org/dev/docs/api/search',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: true, images: true, documents: false,
    downloads: false, api: true, bulk: false, coordinates: false, license: false,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 20, delayMs: 3000, maxPages: 5, maxResults: 20 },
  priority: 20,
  description: 'Open Library bibliographic search API (JSON). Identifies the app via the shared User-Agent; Open Library asks API consumers to cache aggressively, so results are treated as cacheable metadata snapshots.',
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

class OpenLibrarySource extends BaseKnowledgeSource {
  _mapDoc(d) {
    const key = first(d.key); // e.g. '/works/OL12345W'
    const coverI = d.cover_i;
    const isbn = first(d.isbn);
    const ia = first(d.ia);
    const authors = Array.isArray(d.author_name) ? d.author_name.filter((a) => a && String(a).trim()) : [];
    return {
      id: key ? `open-library:${key.replace(/^\//, '')}` : null,
      sourceId: key,
      sourceUrl: key ? `https://openlibrary.org${key}` : null,
      title: first(d.title),
      description: null,
      type: 'book',
      creator: authors.length ? authors.join(', ') : null,
      date: d.first_publish_year != null ? String(d.first_publish_year) : null,
      language: first(d.language),
      contentUrl: key ? `https://openlibrary.org${key}` : null,
      thumbnailUrl: coverI ? `https://covers.openlibrary.org/b/id/${coverI}-M.jpg` : null,
      license: 'unknown',
      rights: 'unknown',
      identifiers: {
        openlibrary: key,
        isbn,
        ia,
        oclc: first(d.oclc),
        lccn: first(d.lccn),
      },
      tags: Array.isArray(d.subject) ? d.subject.slice(0, 8) : [],
      categories: ['open-library'],
      author: authors,
      publisher: first(d.publisher),
      publicationDate: d.first_publish_year != null ? String(d.first_publish_year) : null,
      isbn: isbn ? [isbn] : [],
      downloadAvailable: d.ebook_access === 'public',
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    options = options || {};
    const max = (this.meta.rateLimit && this.meta.rateLimit.maxResults) || 20;
    const limit = Math.min(Math.max(Number(options.limit) || max, 1), max);
    const url = this._buildUrl('https://openlibrary.org/search.json', {
      q: String(query).trim(), limit,
    });
    const data = await this.getJson(url);
    const docs = data && Array.isArray(data.docs) ? data.docs : [];
    return docs.slice(0, limit).map((d) => {
      const p = this._mapDoc(d);
      return book(Object.assign({ source: this.id }, p));
    }).filter((r) => r.title != null || r.id != null);
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const data = await this.getJson(this._buildUrl('https://openlibrary.org/search.json', { q: 'test', limit: 1 }), { timeoutMs: 15000 });
      const ok = data && Array.isArray(data.docs);
      return { id: this.id, status: ok ? 'ok' : 'error', latencyMs: Date.now() - t0, detail: ok ? 'search.json reachable' : 'unexpected API response' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 160) };
    }
  }
}

module.exports = { meta, createSource: (deps) => new OpenLibrarySource(deps, meta) };
