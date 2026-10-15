'use strict';
/* Eporner official API v2 adapter.
 * Docs: https://www.eporner.com/api/v2/  (published by Eporner for webmasters)
 * Endpoints used: video/search/, video/id/  — GET, JSON, no auth. */

const { getJson } = require('./http.cjs');
const registry = require('./registry.cjs');

const SRC = registry.get('eporner');

function buildSearchUrl({ query, perPage = 30, page = 1, order = 'latest', thumbsize = 'big' }) {
  const u = new URL(SRC.base + 'search/');
  if (query) u.searchParams.set('query', query);
  u.searchParams.set('per_page', String(Math.min(100, Math.max(1, perPage))));
  u.searchParams.set('page', String(Math.max(1, page)));
  u.searchParams.set('thumbsize', thumbsize);
  u.searchParams.set('order', order); // latest | mostviewed | toprated | longest
  u.searchParams.set('gay', '0');
  u.searchParams.set('lq', '0');
  u.searchParams.set('format', 'json');
  return u.toString();
}

function buildIdUrl(id) {
  const u = new URL(SRC.base + 'id/');
  u.searchParams.set('id', id);
  u.searchParams.set('per_page', '1');
  u.searchParams.set('thumbsize', 'big');
  u.searchParams.set('format', 'json');
  return u.toString();
}

/* Normalize one API video object to the tool's universal result format. */
function normalize(v) {
  const thumbs = Array.isArray(v.thumbs) ? v.thumbs.map(t => t.src).filter(Boolean) : [];
  return {
    id: v.id,
    provider: 'eporner',
    title: v.title || '(untitled)',
    url: v.url,                       // official video page
    embed_url: v.embed || null,       // official embed player
    preview: (v.default_thumb && v.default_thumb.src) || thumbs[0] || null,
    thumbnails: thumbs,
    duration_sec: v.length_sec || 0,
    duration: v.length_min || '',
    views: Number(v.views) || 0,
    rating: v.rate != null ? Number(v.rate) : null,
    added: v.added || null,
    keywords: String(v.keywords || '').split(',').map(s => s.trim()).filter(Boolean),
  };
}

async function search(opts) {
  const res = await getJson(buildSearchUrl(opts), SRC.rate_limit_ms);
  if (!res.ok) return res;
  const d = res.data || {};
  const videos = Array.isArray(d.videos) ? d.videos : [];
  return {
    ok: true,
    provider: 'eporner',
    count: d.count != null ? d.count : videos.length,
    total_count: d.total_count != null ? Number(d.total_count) : null,
    total_pages: d.total_pages != null ? Number(d.total_pages) : null,
    page: d.page != null ? Number(d.page) : (opts.page || 1),
    results: videos.map(normalize),
  };
}

async function byId(id) {
  const res = await getJson(buildIdUrl(id), SRC.rate_limit_ms);
  if (!res.ok) return res;
  // video/id/ returns the video object directly (not wrapped in {videos:[...]}).
  const videos = Array.isArray(res.data.videos) ? res.data.videos
    : (res.data && res.data.id ? [res.data] : []);
  if (!videos.length) return { ok: false, error: 'video not found or removed' };
  return { ok: true, provider: 'eporner', results: [normalize(videos[0])] };
}

module.exports = { search, byId, normalize };
