'use strict';
/**
 * LyricsBogie adapter — Hindi/Punjabi/Urdu song lyrics directory (link-only).
 * Verified 2026-10-05: the site's /search/?q= page is Google-CSE (JS-only).
 * The live, server-side search is the public WordPress REST API:
 *   GET https://www.lyricsbogie.com/wp-json/wp/v2/search?search=Q&per_page=N&subtype=post
 * Lookup resolves a song-page slug (or numeric post id) to /wp/v2/posts and
 * extracts only public editorial metadata (never the lyrics body).
 */
const { fetchText } = require('../http');
const { cleanText, absUrl } = require('../html');

const META = {
  id: 'lyricsbogie', name: 'LyricsBogie', type: 'lyrics', country: 'IN',
  languages: ['hi', 'pa', 'ur', 'en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 14, needsKey: null,
  baseUrl: 'https://www.lyricsbogie.com', enabled: true,
};

const REST = META.baseUrl + '/wp-json/wp/v2';

function stripLyricsSuffix(t) {
  return cleanText(t).replace(/\s+lyrics(\s+\d+)?$/i, '').trim();
}

/** Parse the site's own editorial excerpt: artist / credits / language / film. */
function parseExcerpt(excerpt) {
  const out = {};
  const t = cleanText(excerpt);
  let m = /has been sung by\s+([^.]+)\./i.exec(t);
  if (m) out.artist = cleanText(m[1]);
  m = /(?:lyrics are penned|written) by\s+([^.]+)\./i.exec(t);
  if (m) out.writers = cleanText(m[1]).split(/\s*,\s*|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
  m = /composed by\s+([^.]+?)(?:\s+and\s+the\s+lyrics\s+are|\.)/i.exec(t);
  if (m) out.producers = cleanText(m[1]).split(/\s*,\s*|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
  m = /is a[n]?\s+([A-Za-z]+)\s+song/i.exec(t);
  if (m) out.language = m[1].toLowerCase();
  m = /from the (?:indian |pakistani )?film\s+([^.]+)\./i.exec(t);
  if (m) out.album = cleanText(m[1]);
  return out;
}

function postToResult(p) {
  const title = stripLyricsSuffix((p.title && p.title.rendered) || '');
  const ex = parseExcerpt((p.excerpt && p.excerpt.rendered) || '');
  const url = p.link || (p.url) || '';
  let cover = '';
  try {
    const fm = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
    if (fm && fm.source_url) cover = fm.source_url;
  } catch (e) { /* ignore */ }
  const artist = ex.artist || '';
  const res = {
    title, artist, artists: artist ? [artist] : [],
    album: ex.album || null, durationMs: null,
    releaseDate: p.date ? String(p.date).slice(0, 10) : null,
    year: p.date ? parseInt(String(p.date).slice(0, 4), 10) || null : null,
    isrc: null, genre: null, language: null, cover: cover || null,
    label: null, writers: ex.writers || [], producers: ex.producers || [],
    url, sourceId: p.id != null ? String(p.id) : null, source: META.id,
    lyricsUrl: url, lyricsAvailable: true, licenseStatus: 'link-only',
    extra: {},
  };
  if (ex.language) res.extra.language = ex.language;
  const snippet = cleanText((p.excerpt && p.excerpt.rendered) || '').slice(0, 160);
  if (snippet) res.snippet = snippet;
  return res;
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  if (!query || !String(query).trim()) return { status: 'ok', results: [], note: 'empty query' };
  const url = REST + '/search?search=' + encodeURIComponent(String(query).trim()) +
    '&per_page=' + limit + '&subtype=post';
  const r = await fetchText(url, { accept: 'application/json' });
  if (!r.ok) {
    if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'request timed out' };
    return { status: 'error', results: [], note: 'http_' + r.status };
  }
  let items;
  try {
    items = JSON.parse(r.text);
  } catch (e) {
    return { status: 'source_changed', results: [], note: 'wp-json search no longer returns JSON' };
  }
  if (!Array.isArray(items)) return { status: 'source_changed', results: [], note: 'unexpected wp-json shape' };
  const results = items
    .filter((x) => x && (x.subtype === 'post' || x.type === 'post') && x.url)
    .slice(0, limit)
    .map((x) => postToResult({ id: x.id, title: { rendered: x.title }, link: x.url, url: x.url, excerpt: { rendered: '' }, date: '' }));
  return { status: 'ok', results };
}

function slugFromInput(urlOrId) {
  const s = String(urlOrId || '').trim();
  if (/^\d+$/.test(s)) return { id: s };
  const m = /^https?:\/\/[^/]+\/(.+?)\/?(?:[?#].*)?$/.exec(s);
  const slug = m ? decodeURIComponent(m[1].split('/').filter(Boolean).pop() || '') : s;
  return { slug };
}

async function lookup(urlOrId, opts = {}) {
  const ref = slugFromInput(urlOrId);
  const url = ref.id
    ? REST + '/posts/' + ref.id + '?_embed=wp:featuredmedia'
    : REST + '/posts?slug=' + encodeURIComponent(ref.slug) + '&_embed=wp:featuredmedia';
  const r = await fetchText(url, { accept: 'application/json' });
  if (!r.ok) {
    if (r.status === 404) return null;
    return null;
  }
  let data;
  try {
    data = JSON.parse(r.text);
  } catch (e) {
    return null;
  }
  const post = Array.isArray(data) ? data[0] : data;
  if (!post || !post.id) return null;
  return postToResult(post);
}

async function health() {
  const started = Date.now();
  const r = await fetchText(REST + '/search?search=p&per_page=1', { accept: 'application/json', retries: 1 });
  const latencyMs = Date.now() - started;
  if (r.ok) return { status: 'healthy', latencyMs, note: 'wp-json search reachable' };
  if (r.error === 'timeout') return { status: 'error', latencyMs, note: 'timeout' };
  return { status: 'error', latencyMs, note: 'http_' + r.status };
}

module.exports = { META, search, lookup, health };
