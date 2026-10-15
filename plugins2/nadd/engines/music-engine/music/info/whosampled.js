'use strict';
/**
 * WhoSampled adapter (music/info).
 *
 * Source: https://www.whosampled.com — sample / cover / remix relationships.
 * Relationships ONLY; no audio, no downloads.
 *
 * Live verification 2026-10-05 from this VM: the whole domain is behind
 * Cloudflare bot protection — GET /search/ and a song page both return
 * HTTP 403 with the Cloudflare challenge page. So every function honestly
 * reports 'blocked' until programmatic access works again. The parse helpers
 * are kept so the adapter works immediately if the block lifts.
 *
 * Song page pattern (verified via web search index, e.g.
 * https://www.whosampled.com/The-Weeknd/Blinding-Lights/):
 *   https://www.whosampled.com/<Artist>/<Title>/
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, anchors } = require('../html');

const META = {
  id: 'whosampled',
  name: 'WhoSampled',
  type: 'info',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: true,
  apiSupported: false,
  scrapingSupported: true,
  priority: 2,
  needsKey: null,
  baseUrl: 'https://www.whosampled.com',
  enabled: true,
};

const BASE = 'https://www.whosampled.com';
const BLOCKED_NOTE =
  'WhoSampled is behind Cloudflare bot protection (HTTP 403 from this environment, ' +
  'verified 2026-10-05 on /search/ and a song page); sample/cover/remix ' +
  'relationships cannot be fetched over plain HTTP.';

function isBlocked(r) {
  return !r.ok && (r.status === 403 || /cloudflare|attention required/i.test(r.text || ''));
}

async function probe(url) {
  try {
    return await fetchText(url, { retries: 0, timeout: 15000 });
  } catch (e) {
    return { ok: false, status: 0, text: '', finalUrl: url, ms: 0, error: String((e && e.message) || e) };
  }
}

/** Best-effort parse of the "Song Connections" table (relationships only). */
function parseRelationships(html, base) {
  const out = [];
  if (!html) return out;
  for (const a of anchors(html, 800)) {
    const url = absUrl(base || BASE, a.href);
    const m = /^https?:\/\/(www\.)?whosampled\.com\/([^/]+)\/([^/]+)\/?$/i.exec(url);
    if (!m || /search|sample|cover|remix/i.test(m[2])) continue;
    const text = a.text;
    if (text.length < 2 || text.length > 120) continue;
    out.push({ type: 'related', title: text, artist: null, url });
    if (out.length >= 25) break;
  }
  return out;
}

async function search(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return { status: 'error', results: [], note: 'empty query' };
  const r = await probe(BASE + '/search/?q=' + encodeURIComponent(q));
  if (isBlocked(r)) return { status: 'blocked', results: [], note: BLOCKED_NOTE };
  if (!r.ok) return { status: 'error', results: [], note: 'search fetch failed (http_' + r.status + ')' };
  const results = parseRelationships(r.text, r.finalUrl).slice(0, Math.max(1, Math.min(opts.limit || 10, 25)));
  return { status: 'ok', results, note: results.length ? 'via whosampled search' : 'no programmatic results parsed' };
}

async function lookup(urlOrId, opts = {}) {
  const s = String(urlOrId || '').trim();
  const m = /^https?:\/\/(www\.)?whosampled\.com\/[^/]+\/[^/]+\/?$/i.exec(s);
  if (!m) return null;
  const r = await probe(s);
  if (!r.ok) return null;
  const rels = parseRelationships(r.text, r.finalUrl);
  return {
    url: s,
    relationships: rels,
    sources: [s],
  };
}

/**
 * sampledBy(query) — relationship listing only (sampled / covered / remixed).
 * Returns {status, relationships:[{type,title,artist,url}], note}.
 */
async function sampledBy(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return { status: 'error', relationships: [], note: 'empty query' };

  // Canonical song-page pattern; verified live-fetch still 403s.
  let pageUrl = null;
  const asUrl = /^https?:\/\/(www\.)?whosampled\.com\//i.test(q) ? q : null;
  if (asUrl) {
    pageUrl = asUrl;
  } else {
    const parts = q.split(/\s*[-–—]\s*|\s+by\s+/i);
    if (parts.length >= 2) {
      const slug = (x) => String(x).trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
      pageUrl = BASE + '/' + slug(parts[1]) + '/' + slug(parts[0]) + '/';
    }
  }
  if (!pageUrl) {
    return {
      status: 'error',
      relationships: [],
      note: 'cannot derive a whosampled page URL from query; pass "Title - Artist" or a whosampled URL. ' + BLOCKED_NOTE,
    };
  }
  const r = await probe(pageUrl);
  if (isBlocked(r)) {
    return { status: 'blocked', relationships: [], note: BLOCKED_NOTE + ' Expected page: ' + pageUrl };
  }
  if (!r.ok) {
    return { status: 'error', relationships: [], note: 'page fetch failed (http_' + r.status + '): ' + pageUrl };
  }
  const relationships = parseRelationships(r.text, r.finalUrl).map((x) => ({
    type: x.type,
    title: x.title,
    artist: x.artist,
    url: x.url,
  }));
  return { status: 'ok', relationships, note: 'parsed from ' + pageUrl + ' (relationship metadata only; no audio)' };
}

async function health() {
  const t0 = Date.now();
  const r = await probe(BASE + '/search/');
  const ms = Date.now() - t0;
  if (isBlocked(r)) return { status: 'blocked', latencyMs: ms, note: BLOCKED_NOTE };
  if (r.ok) return { status: 'healthy', latencyMs: ms, note: 'search page reachable' };
  return { status: 'degraded', latencyMs: ms, note: 'http_' + r.status };
}

module.exports = { META, search, lookup, health, sampledBy };
