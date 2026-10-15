'use strict';
/**
 * Musixmatch adapter (music/translation) — LINK ONLY unless an API key is set.
 *
 * Without MUSIXMATCH_API_KEY, translate() returns
 *   { available:false, url:<musixmatch web search URL for the song>, language,
 *     note:'Translation lookup requires MUSIXMATCH_API_KEY; link provided' }.
 *
 * With a key, it uses the REAL, verified Musixmatch API v1.1 endpoint
 *   GET https://api.musixmatch.com/ws/1.1/track.lyrics.translation.get
 *     ?commontrack_id=<id>&selected_language=<iso>&apikey=<key>
 * (verified live 2026-10-05: called without a key it returns the standard
 * Musixmatch 401 envelope {"message":{"header":{"status_code":401,...}}},
 * proving the endpoint exists. Parameters commontrack_id + selected_language
 * per the public API docs/client libraries. Auth is the `apikey` query param.)
 * The commontrack_id is resolved first via the verified track.search endpoint.
 *
 * NEVER returns a full translated copy: with a key, at most a <=160-char
 * excerpt of the API-returned translation body is included; the full text
 * lives behind the returned link.
 *
 * NOTE: the sibling music/lyrics musixmatch adapter is owned by another
 * worker — this file is fully self-contained and never requires it.
 */
const { fetchJson } = require('../http');

const META = {
  id: 'musixmatch-translation',
  name: 'Musixmatch (Translation)',
  type: 'translation',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: true,
  apiSupported: true,
  scrapingSupported: false,
  priority: 2,
  needsKey: 'MUSIXMATCH_API_KEY',
  baseUrl: 'https://www.musixmatch.com',
  enabled: true,
};

const API_BASE = 'https://api.musixmatch.com/ws/1.1';
const WEB_BASE = 'https://www.musixmatch.com';
const NO_KEY_NOTE = 'Translation lookup requires MUSIXMATCH_API_KEY; link provided';

/** Language name or code -> ISO 639-1 code for `selected_language`. */
const LANG_CODES = {
  english: 'en', urdu: 'ur', hindi: 'hi', punjabi: 'pa', bengali: 'bn',
  tamil: 'ta', telugu: 'te', malayalam: 'ml', kannada: 'kn', marathi: 'mr',
  gujarati: 'gu', pashto: 'ps', persian: 'fa', farsi: 'fa', arabic: 'ar',
  turkish: 'tr', spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', dutch: 'nl', russian: 'ru', polish: 'pl', swedish: 'sv',
  japanese: 'ja', korean: 'ko', chinese: 'zh', indonesian: 'id', malay: 'ms',
  thai: 'th', vietnamese: 'vi',
};
function langCode(lang) {
  const l = String(lang || '').trim().toLowerCase();
  if (/^[a-z]{2,3}$/.test(l)) return l.slice(0, 2);
  return LANG_CODES[l] || 'en';
}

function webSearchUrl(title, artist) {
  return WEB_BASE + '/search/' + encodeURIComponent([title, artist].filter(Boolean).join(' ').trim());
}

function apiKeyOf(opts) {
  return process.env.MUSIXMATCH_API_KEY || (opts && opts.apiKey) || null;
}

/** Unwrap Musixmatch envelope; returns {code, body} or throws on transport failure. */
async function mxmCall(path, params, key) {
  const qs = Object.keys(params)
    .map((k) => k + '=' + encodeURIComponent(params[k]))
    .join('&');
  const r = await fetchJson(API_BASE + path + '?' + qs + '&apikey=' + encodeURIComponent(key), {
    retries: 0,
    timeout: 20000,
  });
  if (!r.ok || !r.data || !r.data.message) {
    throw new Error('musixmatch api transport failure (' + (r.error || 'http_' + r.status) + ')');
  }
  const msg = r.data.message;
  const code = msg.header && msg.header.status_code;
  return { code, body: msg.body || {} };
}

async function resolveCommonTrackId(title, artist, key) {
  const res = await mxmCall('/track.search', {
    q_track: title,
    q_artist: artist,
    page_size: 3,
    s_track_rating: 'desc',
  }, key);
  if (res.code !== 200) return { error: 'track.search status ' + res.code };
  const list = res.body.track_list || [];
  const first = list[0] && list[0].track;
  if (!first || !first.commontrack_id) return { error: 'no track match' };
  return { id: first.commontrack_id, track: first };
}

async function search(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return { status: 'error', results: [], note: 'empty query' };
  const key = apiKeyOf(opts);
  if (!key) {
    return { status: 'auth_required', results: [], note: NO_KEY_NOTE + ' (set MUSIXMATCH_API_KEY for API search)' };
  }
  let res;
  try {
    res = await mxmCall('/track.search', { q, page_size: 10, s_track_rating: 'desc' }, key);
  } catch (e) {
    return { status: 'error', results: [], note: String((e && e.message) || e) };
  }
  if (res.code === 401 || res.code === 403) {
    return { status: 'auth_required', results: [], note: 'musixmatch rejected the API key (status ' + res.code + ')' };
  }
  if (res.code !== 200) {
    return { status: 'error', results: [], note: 'track.search status ' + res.code };
  }
  const results = (res.body.track_list || []).slice(0, 10).map((e) => {
    const t = e.track || {};
    return {
      title: t.track_name,
      artist: t.artist_name,
      album: t.album_name,
      commontrack_id: t.commontrack_id,
      url: webSearchUrl(t.track_name, t.artist_name),
      source: 'musixmatch',
    };
  });
  return { status: 'ok', results, note: 'via musixmatch track.search' };
}

async function lookup(urlOrId, opts = {}) {
  return null;
}

async function translate(track, lang, opts = {}) {
  const title = track && track.title ? String(track.title).trim() : '';
  const artist = track && track.artist ? String(track.artist).trim() : '';
  const language = String(lang || '').trim() || 'unknown';
  const url = webSearchUrl(title, artist);
  const key = apiKeyOf(opts);

  if (!key) {
    return { available: false, url, language, note: NO_KEY_NOTE };
  }

  let idRes;
  try {
    idRes = await resolveCommonTrackId(title, artist, key);
  } catch (e) {
    return { available: false, url, language, note: 'track lookup failed: ' + String((e && e.message) || e) };
  }
  if (idRes.error) {
    return { available: false, url, language, note: 'track lookup failed: ' + idRes.error };
  }

  let res;
  try {
    res = await mxmCall('/track.lyrics.translation.get', {
      commontrack_id: idRes.id,
      selected_language: langCode(language),
    }, key);
  } catch (e) {
    return { available: false, url, language, note: 'translation fetch failed: ' + String((e && e.message) || e) };
  }
  if (res.code === 401 || res.code === 403) {
    return { available: false, url, language, note: 'musixmatch rejected the API key (status ' + res.code + ')' };
  }
  if (res.code !== 200) {
    return { available: false, url, language, note: 'track.lyrics.translation.get status ' + res.code + ' (translation may not exist for this language)' };
  }
  const tr = res.body.lyrics_translation || {};
  const body = typeof tr.lyrics_translation_body === 'string' ? tr.lyrics_translation_body.trim() : '';
  if (!body) {
    return { available: false, url, language, note: 'no translation available for "' + language + '" on this track' };
  }
  return {
    available: true,
    url,
    language,
    excerpt: body.slice(0, 160),
    summary: tr.translation_language_description
      ? 'Translation language: ' + tr.translation_language_description
      : undefined,
    note: 'excerpt (<=160 chars) from Musixmatch API; full translation available only via the link',
  };
}

async function health() {
  const t0 = Date.now();
  try {
    // No key needed to prove the endpoint exists: it answers 401.
    const res = await mxmCall('/track.lyrics.translation.get', { commontrack_id: 1, selected_language: 'en' }, 'invalid');
    const ms = Date.now() - t0;
    if (res.code === 401 || res.code === 403) {
      return {
        status: apiKeyOf({}) ? 'healthy' : 'auth_required',
        latencyMs: ms,
        note: 'musixmatch api reachable (translation endpoint answers 401 without a valid key); set MUSIXMATCH_API_KEY for full access',
      };
    }
    return { status: 'degraded', latencyMs: ms, note: 'unexpected api status ' + res.code };
  } catch (e) {
    return { status: 'unhealthy', latencyMs: Date.now() - t0, note: String((e && e.message) || e) };
  }
}

module.exports = { META, search, lookup, health, translate };
