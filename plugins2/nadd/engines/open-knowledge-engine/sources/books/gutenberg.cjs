/*
 * sources/books/gutenberg.cjs — Project Gutenberg adapter (GROUP B).
 *
 * Transport: html, status: limited. Project Gutenberg has no official
 * search API, so the search results page is parsed defensively:
 *   https://www.gutenberg.org/ebooks/search/?query=<q>
 * Layout live-verified 2026-10-05: <li class="booklink"><a class="link"
 * href="/ebooks/<num>">...<span class="title">T</span>
 * <span class="subtitle">Author</span><span class="extra">N downloads</span>
 * Parsing is deliberately conservative: only title, author, ebook number,
 * download count, and the derived cover URL are extracted. Missing data is
 * never fabricated.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');
const { book } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'gutenberg',
  name: 'Project Gutenberg',
  category: 'books',
  transport: 'html',
  baseUrl: 'https://www.gutenberg.org',
  docsUrl: 'https://www.gutenberg.org/ebooks/search/',
  implemented: true,
  status: 'limited',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: false, images: true, documents: true,
    downloads: true, api: false, bulk: false, coordinates: false, license: true,
    citations: false,
  },
  rateLimit: { requestsPerMinute: 10, delayMs: 6000, maxPages: 5, maxResults: 20 },
  priority: 30,
  description: 'Project Gutenberg public-domain ebook search. No official search API exists; results are parsed defensively from the HTML search page (single page, limited fields). All items are public-domain in the US.',
};

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || null;
}

class GutenbergSource extends BaseKnowledgeSource {
  _parse(html, limit) {
    const out = [];
    const blocks = html.match(/<li class="booklink">([\s\S]*?)<\/li>/g) || [];
    for (const block of blocks) {
      if (out.length >= limit) break;
      const href = block.match(/href="\/ebooks\/(\d+)"/);
      const num = href ? href[1] : null;
      const title = stripTags((block.match(/<span class="title">([\s\S]*?)<\/span>/) || [])[1]);
      const author = stripTags((block.match(/<span class="subtitle">([\s\S]*?)<\/span>/) || [])[1]);
      if (!title && !num) continue; // never fabricate
      out.push({ num, title, author });
    }
    return out;
  }

  _mapRow(r) {
    return {
      id: r.num ? `gutenberg:${r.num}` : null,
      sourceId: r.num,
      sourceUrl: r.num ? `https://www.gutenberg.org/ebooks/${r.num}` : null,
      title: r.title,
      description: null,
      type: 'book',
      creator: r.author,
      date: null,
      language: null,
      contentUrl: r.num ? `https://www.gutenberg.org/ebooks/${r.num}` : null,
      thumbnailUrl: r.num ? `https://www.gutenberg.org/cache/epub/${r.num}/pg${r.num}.cover.small.jpg` : null,
      license: 'public-domain',
      licenseUrl: 'https://www.gutenberg.org/policy/license.html',
      rights: 'public-domain',
      identifiers: { gutenberg: r.num },
      categories: ['gutenberg'],
      author: r.author,
      downloadAvailable: r.num != null,
    };
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    options = options || {};
    const max = (this.meta.rateLimit && this.meta.rateLimit.maxResults) || 20;
    const limit = Math.min(Math.max(Number(options.limit) || max, 1), max);
    const url = this._buildUrl('https://www.gutenberg.org/ebooks/search/', { query: String(query).trim() });
    const html = await this.getText(url, { maxBytes: 2 * 1024 * 1024 });
    return this._parse(html, limit).map((r) => book(Object.assign({ source: this.id }, this._mapRow(r))))
      .filter((r) => r.title != null || r.id != null);
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const html = await this.getText(this._buildUrl('https://www.gutenberg.org/ebooks/search/', { query: 'test' }), { timeoutMs: 15000, maxBytes: 512 * 1024 });
      const ok = /class="booklink"/.test(html);
      return { id: this.id, status: ok ? 'ok' : 'error', latencyMs: Date.now() - t0, detail: ok ? 'search page parseable' : 'search page layout changed' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 160) };
    }
  }
}

module.exports = { meta, createSource: (deps) => new GutenbergSource(deps, meta) };
