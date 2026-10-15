/*
 * sources/books/standardebooks.cjs — Standard Ebooks adapter (GROUP B).
 *
 * Transport: feed, status: limited. Live-verified 2026-10-05:
 * - `https://standardebooks.org/opds/all` now redirects to the feeds info
 *   page: the full "all ebooks" OPDS feed is a Patrons Circle (membership)
 *   benefit and is NOT openly accessible.
 * - The openly available feed is the New Releases Atom feed:
 *   https://standardebooks.org/feeds/atom/new-releases
 *   (verified: Atom entries with id/title/author/name/published/updated/
 *   rights/summary/category/media:thumbnail/link).
 * The feed is fetched once (24h in-memory cache) and filtered client-side
 * by query terms against title/author/summary/subjects. XML is parsed with
 * minimal regex only (no XML library, zero deps); at most 200 entries are
 * parsed for memory protection.
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');
const { book } = require('../../core/metadata-normalizer.cjs');

const meta = {
  id: 'standardebooks',
  name: 'Standard Ebooks',
  category: 'ebooks',
  transport: 'feed',
  baseUrl: 'https://standardebooks.org',
  docsUrl: 'https://standardebooks.org/feeds/opds/all',
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
  priority: 50,
  description: 'Standard Ebooks public-domain ebook feeds. The full catalog OPDS feed requires Patrons Circle membership; this adapter uses the openly available New Releases Atom feed, cached once and filtered client-side by query.',
};

const FEED_URL = 'https://standardebooks.org/feeds/atom/new-releases';
const MAX_ENTRIES = 200; // memory protection
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let _cache = { ts: 0, entries: null };

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)<\\/${name}>`));
  return m ? m[1].trim() || null : null;
}

function stripEntities(s) {
  if (s == null) return null;
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function parseEntry(xml) {
  const id = tag(xml, 'id');
  const title = stripEntities(tag(xml, 'title'));
  const am = xml.match(/<author>([\s\S]*?)<\/author>/);
  const author = am ? stripEntities(tag(am[1], 'name')) : null;
  const published = tag(xml, 'published');
  const updated = tag(xml, 'updated');
  const rights = stripEntities(tag(xml, 'rights'));
  const summary = stripEntities(tag(xml, 'summary'));
  const subjects = [];
  const cats = xml.match(/<category[^>]*term="([^"]*)"[^>]*\/?>/g) || [];
  for (const c of cats) {
    const t = c.match(/term="([^"]*)"/);
    if (t && t[1]) subjects.push(t[1]);
  }
  const thumb = xml.match(/<media:thumbnail[^>]*url="([^"]*)"/);
  const thumbUrl = thumb ? thumb[1] : null;
  // alternate (ebook page) link and epub acquisition link; attr order varies
  let pageUrl = null, epubUrl = null;
  const links = xml.match(/<link[^>]*>/g) || [];
  for (const l of links) {
    const href = (l.match(/href="([^"]*)"/) || [])[1];
    if (!href) continue;
    if (/rel="alternate"/.test(l) && !pageUrl) pageUrl = href;
    if (/application\/epub\+zip/.test(l) && !epubUrl) epubUrl = href;
  }
  const slug = id ? id.replace(/^https?:\/\/[^/]+\/ebooks\//, '').replace(/\/$/, '') : null;
  return {
    id: id ? `standardebooks:${slug || id}` : null,
    sourceId: slug || id,
    sourceUrl: pageUrl || id || null,
    title,
    description: summary,
    type: 'book',
    creator: author,
    date: published ? published.slice(0, 10) : null,
    updatedAt: updated || null,
    language: 'eng',
    contentUrl: epubUrl || pageUrl || null,
    thumbnailUrl: thumbUrl,
    license: rights && /public domain/i.test(rights) ? 'public-domain' : 'unknown',
    licenseUrl: null,
    rights: rights || 'unknown',
    identifiers: { standardebooks: slug || id },
    tags: subjects,
    categories: ['standardebooks'],
    author,
    publicationDate: published ? published.slice(0, 10) : null,
    downloadAvailable: epubUrl != null,
  };
}

class StandardEbooksSource extends BaseKnowledgeSource {
  async _entries() {
    const now = Date.now();
    if (_cache.entries && now - _cache.ts < CACHE_TTL_MS) return _cache.entries;
    const xml = await this.getText(FEED_URL, { maxBytes: 4 * 1024 * 1024 });
    const entries = [];
    const re = /<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = re.exec(xml)) !== null && entries.length < MAX_ENTRIES) {
      const e = parseEntry(m[1]);
      if (e.title || e.id) entries.push(e);
    }
    _cache = { ts: now, entries };
    return entries;
  }

  _matches(entry, query) {
    const hay = [entry.title, entry.creator, entry.description, ...(entry.tags || [])]
      .filter(Boolean).join(' ').toLowerCase();
    return String(query).toLowerCase().split(/\s+/).filter(Boolean)
      .every((tok) => hay.includes(tok));
  }

  async search(query, options) {
    if (!query || !String(query).trim()) return [];
    options = options || {};
    const max = (this.meta.rateLimit && this.meta.rateLimit.maxResults) || 20;
    const limit = Math.min(Math.max(Number(options.limit) || max, 1), max);
    const entries = await this._entries();
    return entries.filter((e) => this._matches(e, query)).slice(0, limit)
      .map((e) => book(Object.assign({ source: this.id }, e)))
      .filter((r) => r.title != null || r.id != null);
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      const entries = await this._entries();
      const ok = Array.isArray(entries) && entries.length > 0;
      return { id: this.id, status: ok ? 'ok' : 'error', latencyMs: Date.now() - t0, detail: ok ? `new-releases Atom feed reachable (${entries.length} entries cached)` : 'feed returned no entries' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String((err && err.message) || err).slice(0, 160) };
    }
  }
}

module.exports = { meta, createSource: (deps) => new StandardEbooksSource(deps, meta) };
