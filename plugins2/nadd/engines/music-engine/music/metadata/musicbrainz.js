'use strict';
/**
 * MusicBrainz metadata adapter.
 *
 * Endpoints VERIFIED live from this VM (2026-10-05):
 *   GET https://musicbrainz.org/ws/2/recording/?query=...&fmt=json  -> 200 JSON
 *   GET https://musicbrainz.org/ws/2/artist/?query=...&fmt=json     -> 200 JSON
 *   GET https://musicbrainz.org/ws/2/release/?query=...&fmt=json    -> 200 JSON
 *   GET https://musicbrainz.org/ws/2/isrc/<ISRC>?fmt=json          -> 200 JSON (or {"error":"Not Found"} when unknown)
 * MusicBrainz requires a descriptive User-Agent on every request; we send 'music-engine/1.0'.
 * Rate limit: ~1 request/second (polite).
 */
const { fetchJson, sleep } = require('../http');
const { cleanText } = require('../html');

const META = {
  id: 'musicbrainz', name: 'MusicBrainz', type: 'metadata', country: 'DE',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: false, priority: 4, needsKey: null,
  baseUrl: 'https://musicbrainz.org', enabled: true,
};

const UA = 'music-engine/1.0';
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/i;
const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let lastReqAt = 0;
async function politeGet(url) {
  const wait = 1000 - (Date.now() - lastReqAt);
  if (wait > 0) await sleep(wait);
  const r = await fetchJson(url, { userAgent: UA, retries: 1 });
  lastReqAt = Date.now();
  return r;
}

function statusOf(r) {
  if (!r) return 'error';
  if (r.status === 429 || r.status === 503 || r.status === 403) return 'blocked';
  if (r.error === 'timeout') return 'timeout';
  if (r.status === 404) return 'ok-empty';
  return 'error';
}

function artistNames(rec) {
  const ac = rec['artist-credit'] || [];
  return ac.map((c) => cleanText(c.name || '')).filter(Boolean);
}

function firstGenre(rec) {
  const tags = rec.tags || [];
  if (tags.length) return cleanText(tags[0].name || '');
  return null;
}

function normalizeRecording(rec, isrcFromPath) {
  if (!rec || !rec.id) return null;
  const artists = artistNames(rec);
  const releases = rec.releases || [];
  const rel = releases[0] || {};
  const date = rec['first-release-date'] || rel.date || null;
  const isrcs = rec.isrcs || [];
  return {
    title: cleanText(rec.title || ''),
    artist: artists[0] || null,
    artists,
    album: cleanText(rel.title || '') || null,
    durationMs: rec.length != null ? Number(rec.length) : null,
    releaseDate: date || null,
    year: date ? Number(String(date).slice(0, 4)) || null : null,
    isrc: isrcFromPath || (isrcs[0] || null),
    genre: firstGenre(rec),
    language: null,
    cover: null, // MusicBrainz has no artwork CDN of its own (Cover Art Archive needs extra lookups)
    label: null,
    writers: [],
    producers: [],
    url: `https://musicbrainz.org/recording/${rec.id}`,
    sourceId: rec.id,
    source: 'musicbrainz',
    extra: { disambiguation: rec.disambiguation || null, score: rec.score != null ? rec.score : null },
  };
}

async function search(query, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 25);
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  try {
    // ISRC-style input -> direct ISRC endpoint
    const isrcCandidate = q.replace(/[^A-Za-z0-9]/g, '');
    if (ISRC_RE.test(isrcCandidate)) {
      const r = await politeGet(`https://musicbrainz.org/ws/2/isrc/${isrcCandidate.toUpperCase()}?fmt=json`);
      if (!r.ok) {
        if (r.status === 404) return { status: 'ok', results: [], note: `ISRC ${isrcCandidate} not found in MusicBrainz` };
        return { status: statusOf(r), results: [], note: `musicbrainz isrc endpoint: http_${r.status}` };
      }
      const recs = (r.data && r.data.recordings) || [];
      return {
        status: 'ok',
        results: recs.slice(0, limit).map((rec) => normalizeRecording(rec, isrcCandidate.toUpperCase())).filter(Boolean),
        note: recs.length ? undefined : 'no recordings for this ISRC',
      };
    }
    // Normal recording search (with ISRCs included when available)
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=${limit}&inc=isrcs`;
    const r = await politeGet(url);
    if (!r.ok) return { status: statusOf(r), results: [], note: `musicbrainz recording search: http_${r.status}` };
    const recs = (r.data && r.data.recordings) || [];
    return {
      status: 'ok',
      results: recs.slice(0, limit).map((rec) => normalizeRecording(rec)).filter(Boolean),
    };
  } catch (e) {
    return { status: 'error', results: [], note: `musicbrainz search failed: ${e.message}` };
  }
}

function parseMbInput(urlOrId) {
  const s = String(urlOrId || '').trim();
  const m = s.match(/musicbrainz\.org\/(recording|release|artist)\/([0-9a-f-]{36})/i);
  if (m) return { entity: m[1].toLowerCase(), mbid: m[2] };
  if (MBID_RE.test(s)) return { entity: 'recording', mbid: s };
  return null;
}

async function lookup(urlOrId, opts = {}) {
  const parsed = parseMbInput(urlOrId);
  if (!parsed) return null;
  const { entity, mbid } = parsed;
  const inc = entity === 'recording' ? 'isrcs+artists+releases' : 'artists';
  const r = await politeGet(`https://musicbrainz.org/ws/2/${entity}/${mbid}?fmt=json&inc=${inc}`);
  if (!r.ok || !r.data) return null;
  const d = r.data;
  if (entity === 'recording') return normalizeRecording(d);
  if (entity === 'release') {
    const artists = (d['artist-credit'] || []).map((c) => cleanText(c.name || '')).filter(Boolean);
    const labels = (d['label-info'] || []).map((l) => cleanText((l.label && l.label.name) || '')).filter(Boolean);
    return {
      title: cleanText(d.title || ''), artist: artists[0] || null, artists,
      album: cleanText(d.title || ''), durationMs: null,
      releaseDate: d.date || null, year: d.date ? Number(String(d.date).slice(0, 4)) || null : null,
      isrc: null, genre: null, language: null, cover: null,
      label: labels[0] || null, writers: [], producers: [],
      url: `https://musicbrainz.org/release/${mbid}`, sourceId: mbid, source: 'musicbrainz',
      extra: { country: d.country || null, status: d.status || null, packaging: d.packaging || null },
    };
  }
  // artist
  return {
    title: null, artist: cleanText(d.name || ''), artists: [cleanText(d.name || '')].filter(Boolean),
    album: null, durationMs: null, releaseDate: null, year: null, isrc: null,
    genre: null, language: null, cover: null, label: null, writers: [], producers: [],
    url: `https://musicbrainz.org/artist/${mbid}`, sourceId: mbid, source: 'musicbrainz',
    extra: { type: d.type || null, country: d.country || null, disambiguation: d.disambiguation || null },
  };
}

async function health() {
  const t0 = Date.now();
  const r = await politeGet('https://musicbrainz.org/ws/2/recording/?query=recording:hello&fmt=json&limit=1');
  if (r.ok) return { status: 'healthy', latencyMs: Date.now() - t0, note: 'musicbrainz ws/2 reachable' };
  const s = statusOf(r);
  return { status: s === 'ok-empty' ? 'degraded' : s, latencyMs: Date.now() - t0, note: `http_${r.status}` };
}

/** Extra: artist metadata by name. */
async function artistInfo(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  const r = await politeGet(`https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(`"${q}"`)}&fmt=json&limit=1`);
  if (!r.ok || !r.data || !(r.data.artists || []).length) return null;
  const a = r.data.artists[0];
  return {
    name: cleanText(a.name || ''), id: a.id, url: `https://musicbrainz.org/artist/${a.id}`,
    country: a.country || null, type: a.type || null,
    lifeSpan: a['life-span'] || null,
    genres: (a.tags || []).map((t) => cleanText(t.name || '')).filter(Boolean),
    source: 'musicbrainz',
  };
}

/** Extra: release (album) metadata by name. */
async function albumInfo(name) {
  const q = String(name || '').trim();
  if (!q) return null;
  const r = await politeGet(`https://musicbrainz.org/ws/2/release/?query=release:${encodeURIComponent(`"${q}"`)}&fmt=json&limit=1`);
  if (!r.ok || !r.data || !(r.data.releases || []).length) return null;
  const rel = r.data.releases[0];
  const artists = (rel['artist-credit'] || []).map((c) => cleanText(c.name || '')).filter(Boolean);
  const labels = (rel['label-info'] || []).map((l) => cleanText((l.label && l.label.name) || '')).filter(Boolean);
  return {
    title: cleanText(rel.title || ''), id: rel.id, url: `https://musicbrainz.org/release/${rel.id}`,
    artist: artists[0] || null, artists, date: rel.date || null,
    year: rel.date ? Number(String(rel.date).slice(0, 4)) || null : null,
    country: rel.country || null, label: labels[0] || null,
    source: 'musicbrainz',
  };
}

module.exports = { META, search, lookup, health, artistInfo, albumInfo };
