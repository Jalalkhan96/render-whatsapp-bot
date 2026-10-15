/*
 * sources/wiki/wikimedia-commons.cjs — Wikimedia Commons (MediaWiki action API).
 *
 * Two-step search (verified 2026-10-05):
 *   1) action=query&list=search&srnamespace=6 on commons.wikimedia.org -> File: titles
 *   2) action=query&prop=imageinfo&iiprop=url|extmetadata|size|mediatype
 *      &iiurlwidth=300 for the same titles (batched, one request)
 * extmetadata supplies url, thumbnail, LicenseShortName, LicenseUrl, Artist,
 * ImageDescription, DateTimeOriginal. HTML in those fields is stripped.
 * Licenses vary per file; missing license metadata stays 'unknown'
 * (never mapped to 'free').
 */
'use strict';

const { BaseKnowledgeSource } = require('../../core/base-source.cjs');

const meta = {
  id: 'wikimedia-commons',
  name: 'Wikimedia Commons',
  category: 'wiki',
  transport: 'api',
  baseUrl: 'https://commons.wikimedia.org',
  docsUrl: 'https://commons.wikimedia.org/wiki/Commons:API',
  implemented: true,
  status: 'ok',
  requiresKey: false,
  envKeys: [],
  capabilities: {
    search: true, metadata: true, fullText: false, images: true, documents: false,
    downloads: false, api: true, bulk: false, coordinates: false,
    license: true, citations: true,
  },
  rateLimit: { requestsPerMinute: 60, delayMs: 200, maxPages: 5, maxResults: 20 },
  priority: 2,
  description: 'Wikimedia Commons freely-licensed media repository via the MediaWiki API; namespace-6 file search enriched with imageinfo extmetadata (media URL, thumbnail, creator, per-file license).',
};

const API = 'https://commons.wikimedia.org/w/api.php';

function stripHtml(s) {
  if (typeof s !== 'string') return null;
  const t = s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

function extVal(em, key) {
  const v = em && em[key] && em[key].value;
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function mediaType(mt) {
  switch (mt) {
    case 'BITMAP':
    case 'DRAWING': return 'image';
    case 'VIDEO': return 'video';
    case 'AUDIO': return 'audio';
    default: return 'media';
  }
}

class WikimediaCommonsSource extends BaseKnowledgeSource {
  _mapPage(page) {
    const title = page.title || null;
    const displayTitle = title ? title.replace(/^File:/i, '') : null;
    const ii = page.imageinfo && page.imageinfo[0];
    if (!ii) return null;
    const em = ii.extmetadata || {};
    const licenseShort = extVal(em, 'LicenseShortName');
    const usageTerms = extVal(em, 'UsageTerms');
    const licenseUrl = extVal(em, 'LicenseUrl');
    const cats = extVal(em, 'Categories');
    const artist = stripHtml(extVal(em, 'Artist'));
    const description = stripHtml(extVal(em, 'ImageDescription'));
    const date = stripHtml(extVal(em, 'DateTimeOriginal') || extVal(em, 'DateTime'));
    const type = mediaType(ii.mediatype);
    return {
      id: title ? `commons:${title}` : null,
      sourceId: title,
      sourceUrl: title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}` : null,
      title: displayTitle,
      description,
      type,
      creator: artist,
      date,
      language: null,
      country: null,
      contentUrl: ii.url || null,
      thumbnailUrl: ii.thumburl || null,
      license: stripHtml(licenseShort || usageTerms),
      licenseUrl,
      rights: 'unknown',
      identifiers: { commons_title: title },
      tags: [],
      categories: cats ? cats.split('|').map((c) => c.trim()).filter(Boolean).slice(0, 10) : [],
      coordinates: { lat: null, lon: null },
      metadata: {
        width: typeof ii.width === 'number' ? ii.width : null,
        height: typeof ii.height === 'number' ? ii.height : null,
        bytes: typeof ii.size === 'number' ? ii.size : null,
        mediatype: ii.mediatype || null,
        mime: ii.mime || null,
        attributionRequired: extVal(em, 'AttributionRequired'),
      },
    };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const limit = Math.max(1, Math.min(options.limit || 10, this.meta.rateLimit.maxResults));
    const searchUrl = this._buildUrl(API, {
      action: 'query',
      list: 'search',
      srsearch: q,
      srnamespace: 6,
      srlimit: limit,
      srprop: 'snippet|titlesnippet',
      format: 'json',
      formatversion: 2,
    });
    const sdata = await this.getJson(searchUrl);
    const hits = (sdata && sdata.query && sdata.query.search) || [];
    if (!hits.length) return [];
    const titles = hits.map((h) => h.title).filter(Boolean);
    const infoUrl = this._buildUrl(API, {
      action: 'query',
      prop: 'imageinfo',
      titles: titles.join('|'),
      iiprop: 'url|extmetadata|size|mediatype',
      iiurlwidth: 300,
      format: 'json',
      formatversion: 2,
    });
    const idata = await this.getJson(infoUrl);
    const pages = (idata && idata.query && idata.query.pages) || [];
    const mapped = pages.map((p) => this._mapPage(p)).filter(Boolean);
    // Keep search-order for stable ranking.
    const byTitle = new Map(mapped.map((r) => [r.sourceId, r]));
    return this.normalizeMany(titles.map((t) => byTitle.get(t)).filter(Boolean));
  }

  async getItem(id, options) {
    options = options || {};
    const raw = String(id || '').trim();
    if (!raw) return null;
    const title = /^file:/i.test(raw) ? raw : `File:${raw}`;
    const url = this._buildUrl(API, {
      action: 'query',
      prop: 'imageinfo',
      titles: title,
      iiprop: 'url|extmetadata|size|mediatype',
      iiurlwidth: 300,
      format: 'json',
      formatversion: 2,
    });
    const data = await this.getJson(url);
    const pages = (data && data.query && data.query.pages) || [];
    const page = pages.find((p) => !p.missing && !p.invalid);
    if (!page) return null;
    const mapped = this._mapPage(page);
    return mapped ? this.normalize(mapped) : null;
  }

  async healthCheck() {
    const t0 = Date.now();
    try {
      await this.getJson(this._buildUrl(API, {
        action: 'query', list: 'search', srsearch: 'test', srnamespace: 6,
        srlimit: 1, format: 'json', formatversion: 2,
      }));
      return { id: this.id, status: 'ok', latencyMs: Date.now() - t0, detail: 'Commons namespace-6 search probe succeeded' };
    } catch (err) {
      return { id: this.id, status: 'error', latencyMs: Date.now() - t0, detail: String(err.message).slice(0, 200) };
    }
  }
}

function createSource(deps) {
  return new WikimediaCommonsSource(deps, meta);
}

module.exports = { meta, createSource };
