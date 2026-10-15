'use strict';
/**
 * Spotify metadata adapter — real OAuth2 client-credentials flow, no audio download ever.
 *
 * Endpoints used (official, documented Spotify Web API):
 *   POST https://accounts.spotify.com/api/token        (grant_type=client_credentials, Basic auth)
 *   GET  https://api.spotify.com/v1/search?q=...&type=track&limit=N
 *   GET  https://api.spotify.com/v1/tracks/<id> | /v1/albums/<id> | /v1/artists/<id>
 *
 * Without SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET (absent on this VM):
 *   search()/health() return { status: 'auth_required', ... } — honest, no fakes.
 * The token endpoint's liveness was confirmed reachable from this VM (responds 400
 * without credentials instead of timing out).
 */
const { fetchText, fetchJson } = require('../http');
const { cleanText } = require('../html');

const META = {
  id: 'spotify', name: 'Spotify', type: 'metadata', country: 'SE',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: false, priority: 5,
  needsKey: 'SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET',
  baseUrl: 'https://api.spotify.com', enabled: true,
};

const AUTH_NOTE = 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET';
let tokenCache = { token: null, expiresAt: 0 };

function haveKeys() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function getToken() {
  if (!haveKeys()) return null;
  if (Date.now() < tokenCache.expiresAt - 30000 && tokenCache.token) return tokenCache.token;
  const creds = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const r = await fetchText('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
    retries: 1,
  });
  if (!r.ok) throw new Error(`spotify token request: http_${r.status}`);
  let data;
  try { data = JSON.parse(r.text); } catch { throw new Error('spotify token request: invalid_json'); }
  if (!data.access_token) throw new Error('spotify token request: no access_token in response');
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return tokenCache.token;
}

function authz(tok) { return { Authorization: `Bearer ${tok}` }; }

function statusOf(r) {
  if (r.status === 401 || r.status === 400) return 'auth_required';
  if (r.status === 429 || r.status === 403) return 'blocked';
  if (r.error === 'timeout') return 'timeout';
  return 'error';
}

function normalizeTrack(t) {
  if (!t || !t.id) return null;
  const artists = (t.artists || []).map((a) => cleanText(a.name || '')).filter(Boolean);
  const album = t.album || {};
  const images = album.images || [];
  const date = album.release_date || null;
  return {
    title: cleanText(t.name || ''),
    artist: artists[0] || null,
    artists,
    album: cleanText(album.name || '') || null,
    durationMs: t.duration_ms != null ? Number(t.duration_ms) : null,
    releaseDate: date,
    year: date ? Number(String(date).slice(0, 4)) || null : null,
    isrc: (t.external_ids && t.external_ids.isrc) || null,
    genre: null,
    language: null,
    cover: images.length ? images[0].url : null,
    label: null,
    writers: [],
    producers: [],
    url: (t.external_urls && t.external_urls.spotify) || `https://open.spotify.com/track/${t.id}`,
    sourceId: t.id,
    source: 'spotify',
    extra: {
      popularity: t.popularity != null ? t.popularity : null,
      explicit: Boolean(t.explicit),
      previewUrl: t.preview_url || null,
      trackNumber: t.track_number != null ? t.track_number : null,
    },
  };
}

async function search(query, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 25);
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  if (!haveKeys()) return { status: 'auth_required', results: [], note: AUTH_NOTE };
  try {
    const tok = await getToken();
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=${limit}&market=US`;
    const r = await fetchJson(url, { headers: authz(tok), retries: 1 });
    if (!r.ok) return { status: statusOf(r), results: [], note: `spotify search: http_${r.status}` };
    const items = ((r.data && r.data.tracks) || {}).items || [];
    return { status: 'ok', results: items.map(normalizeTrack).filter(Boolean) };
  } catch (e) {
    const s = /401|auth/i.test(e.message) ? 'auth_required' : 'error';
    return { status: s, results: [], note: `spotify search failed: ${e.message}` };
  }
}

function parseSpotifyInput(urlOrId) {
  const s = String(urlOrId || '').trim();
  let m = s.match(/open\.spotify\.com\/(track|album|artist)\/([A-Za-z0-9]+)/)
    || s.match(/spotify:(track|album|artist):([A-Za-z0-9]+)/);
  if (m) return { kind: m[1], id: m[2] };
  if (/^[A-Za-z0-9]{22}$/.test(s)) return { kind: 'track', id: s };
  return null;
}

async function lookup(urlOrId, opts = {}) {
  const parsed = parseSpotifyInput(urlOrId);
  if (!parsed) return null;
  if (!haveKeys()) return null; // no keyless lookup exists
  try {
    const tok = await getToken();
    const r = await fetchJson(`https://api.spotify.com/v1/${parsed.kind}s/${parsed.id}?market=US`, {
      headers: authz(tok), retries: 1,
    });
    if (!r.ok || !r.data) return null;
    const d = r.data;
    if (parsed.kind === 'track') return normalizeTrack(d);
    const images = d.images || [];
    const artists = (d.artists || []).map((a) => cleanText(a.name || '')).filter(Boolean);
    const date = d.release_date || null;
    return {
      title: cleanText(d.name || ''), artist: artists[0] || null, artists,
      album: parsed.kind === 'album' ? cleanText(d.name || '') : null,
      durationMs: null, releaseDate: date,
      year: date ? Number(String(date).slice(0, 4)) || null : null,
      isrc: null, genre: (d.genres || [])[0] ? cleanText(d.genres[0]) : null,
      language: null, cover: images.length ? images[0].url : null,
      label: d.label ? cleanText(d.label) : null, writers: [], producers: [],
      url: (d.external_urls && d.external_urls.spotify) || `https://open.spotify.com/${parsed.kind}/${d.id}`,
      sourceId: d.id, source: 'spotify',
      extra: { kind: parsed.kind, popularity: d.popularity != null ? d.popularity : null },
    };
  } catch { return null; }
}

async function health() {
  const t0 = Date.now();
  if (!haveKeys()) {
    return { status: 'auth_required', latencyMs: Date.now() - t0, note: AUTH_NOTE };
  }
  try {
    await getToken();
    return { status: 'healthy', latencyMs: Date.now() - t0, note: 'spotify client-credentials token acquired' };
  } catch (e) {
    return { status: 'auth_required', latencyMs: Date.now() - t0, note: `spotify auth failed: ${e.message}` };
  }
}

module.exports = { META, search, lookup, health };
