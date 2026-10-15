'use strict';
/**
 * Discogs metadata adapter (website scraping; API deliberately NOT used — it needs an OAuth token).
 *
 * Live verification from this VM (2026-10-05):
 *   GET https://www.discogs.com/search/?q=...&type=all -> HTTP 403 (datacenter block),
 *   consistent with curl. Both fetchText (browser UA) and curl are refused.
 * The adapter therefore attempts the live request and, on 403/network refusal,
 * honestly returns { status: 'blocked' }. Parsing code below follows Discogs'
 * documented public markup (OpenGraph and Twitter meta tags + <a> links to /release/ and
 * /artist/ pages) and activates automatically if the block ever lifts.
 */
const { fetchText } = require('../http');
const { cleanText, metaContent, anchors, absUrl } = require('../html');

const META = {
  id: 'discogs', name: 'Discogs', type: 'metadata', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 6, needsKey: null,
  baseUrl: 'https://www.discogs.com', enabled: true,
};

const SEARCH_URL = (q) => `https://www.discogs.com/search/?q=${encodeURIComponent(q)}&type=all`;
const BLOCKED_NOTE = 'Discogs blocks this network (HTTP 403 on discogs.com); website scraping unavailable. Discogs API requires an OAuth token.';

function statusOf(r) {
  if (!r) return 'error';
  // status 0 = connection-level refusal (reset/closed); Discogs actively refuses
  // this datacenter network (verified: 403 via fetchText, dropped connection via curl).
  if (r.status === 0 || r.status === 403 || r.status === 429) return 'blocked';
  if (r.error === 'timeout') return 'timeout';
  return 'error';
}

/** Pull /release/<id>-... and /artist/<id>-... links from a search page. */
function parseSearchPage(html) {
  const seen = new Set();
  const out = [];
  for (const a of anchors(html, 2000)) {
    const href = String(a.href || '');
    const m = href.match(/^https:\/\/www\.discogs\.com\/(release|artist)\/(\d+)-/);
    if (!m) continue;
    const url = m[0].replace(/-$/, '');
    const key = `${m[1]}:${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: cleanText(a.text || ''), url, kind: m[1] });
    if (out.length >= 25) break;
  }
  return out;
}

/** Best-effort public metadata from a release or artist page. */
function parseEntityPage(url, html) {
  const isRelease = /\/release\//.test(url);
  const ogTitle = cleanText(metaContent(html, 'og:title') || '');
  const ogDesc = cleanText(metaContent(html, 'og:description') || '');
  const cover = absUrl('https://www.discogs.com', metaContent(html, 'og:image') || '');
  // Release pages: og:description is typically "Label: X – Catalog#...".
  let label = null; let catalog = null; let year = null; let genre = null;
  if (isRelease && ogDesc) {
    const lm = ogDesc.match(/Label:\s*([^–\-•]+?)\s*(?:–|-|•|$)/i);
    if (lm) label = cleanText(lm[1]);
    const cm = ogDesc.match(/(?:Cat#|Catalog#|Cat no|Catalogue)[\s:]*([A-Za-z0-9][\w\-. /]*)/i);
    if (cm) catalog = cleanText(cm[1]);
    const ym = ogDesc.match(/\b(19|20)\d{2}\b/);
    if (ym) year = Number(ym[0]);
    const gm = ogDesc.match(/Genre:\s*([^,–\-•]+)/i);
    if (gm) genre = cleanText(gm[1]);
  }
  // Title lines like "Artist – Title" or "Title – Artist".
  let artist = null; let title = ogTitle;
  const parts = ogTitle.split(/\s+[–-]\s+/);
  if (isRelease && parts.length >= 2) { artist = parts[0]; title = parts.slice(1).join(' – '); }
  if (!isRelease) { artist = ogTitle || null; title = ogTitle || null; }
  const ym2 = ogTitle.match(/\b(19|20)\d{2}\b/);
  if (!year && ym2) year = Number(ym2[0]);

  return {
    title: title || null, artist: artist || null, artists: artist ? [artist] : [],
    album: isRelease ? (title || null) : null, durationMs: null,
    releaseDate: null, year, isrc: null, genre, language: null,
    cover: cover || null, label, writers: [], producers: [],
    url, sourceId: (url.match(/\/(?:release|artist)\/(\d+)/) || [])[1] || null,
    source: 'discogs',
    extra: { kind: isRelease ? 'release' : 'artist', catalog, description: ogDesc || null },
  };
}

async function search(query, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 25);
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const r = await fetchText(SEARCH_URL(q), { retries: 0 });
  if (!r.ok) {
    const s = statusOf(r);
    const note = s === 'blocked' ? BLOCKED_NOTE : `discogs search: http_${r.status}${r.error ? ` (${r.error})` : ''}`;
    return { status: s, results: [], note };
  }
  const hits = parseSearchPage(r.text);
  const results = [];
  for (const h of hits.slice(0, limit)) {
    // Light touch: only resolve details on demand; list what the search page gives.
    results.push({
      title: h.title || null, artist: null, artists: [], album: h.kind === 'release' ? (h.title || null) : null,
      durationMs: null, releaseDate: null, year: null, isrc: null, genre: null,
      language: null, cover: null, label: null, writers: [], producers: [],
      url: h.url, sourceId: (h.url.match(/\/(?:release|artist)\/(\d+)/) || [])[1] || null,
      source: 'discogs', extra: { kind: h.kind },
    });
  }
  return { status: 'ok', results, note: results.length ? undefined : 'no results on discogs search page' };
}

function isDiscogsUrl(s) {
  return /discogs\.com\/(release|artist)\/\d+/.test(String(s || ''));
}

async function lookup(urlOrId, opts = {}) {
  const s = String(urlOrId || '').trim();
  if (!isDiscogsUrl(s)) {
    // Treat a bare id as a release id.
    if (/^\d{2,}$/.test(s)) return lookup(`https://www.discogs.com/release/${s}-`, opts);
    return null;
  }
  const r = await fetchText(s, { retries: 0 });
  if (!r.ok) return null; // blocked/404 -> no data, not a fake
  return parseEntityPage(r.finalUrl || s, r.text);
}

async function health() {
  const t0 = Date.now();
  const r = await fetchText('https://www.discogs.com/search/?q=test&type=all', { retries: 0 });
  if (r.ok) return { status: 'healthy', latencyMs: Date.now() - t0, note: 'discogs reachable' };
  const s = statusOf(r);
  return { status: s, latencyMs: Date.now() - t0, note: s === 'blocked' ? BLOCKED_NOTE : `http_${r.status}` };
}

/** Extra: artist metadata — search then resolve the first artist hit. */
async function artistInfo(name) {
  const res = await search(name, { limit: 10 });
  const hit = res.results.find((x) => x.extra && x.extra.kind === 'artist');
  if (!hit) return null;
  const full = await lookup(hit.url);
  if (!full) return null;
  return { name: full.artist, url: full.url, cover: full.cover, source: 'discogs' };
}

/** Extra: release (album) metadata — search then resolve the first release hit. */
async function albumInfo(name) {
  const res = await search(name, { limit: 10 });
  const hit = res.results.find((x) => x.extra && x.extra.kind === 'release');
  if (!hit) return null;
  const full = await lookup(hit.url);
  if (!full) return null;
  return {
    title: full.title, artist: full.artist, url: full.url, year: full.year,
    label: full.label, genre: full.genre, cover: full.cover, source: 'discogs',
  };
}

module.exports = { META, search, lookup, health, artistInfo, albumInfo };
