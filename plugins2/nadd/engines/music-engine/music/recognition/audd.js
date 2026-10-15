'use strict';
/**
 * AudD audio-recognition adapter — REAL implementation.
 *
 * Verified against official docs (https://docs.audd.io and AudD's GitHub):
 *
 *   POST https://api.audd.io/  (multipart/form-data)
 *     api_token : token from dashboard.audd.io
 *     file      : audio file bytes   (or `url` with a file URL instead)
 *     return    : comma-separated extras, e.g. "apple_music,spotify"
 *     market    : country code for Apple Music/Spotify links (default "us")
 *
 * Success body: { status: "success", result: { artist, title, album,
 *   release_date, label, timecode, song_link, spotify: {id, ...},
 *   apple_music: {url, ...}, ... } }
 * Error body: { status: "error", error: { error_code, error_message } }
 *
 * Env: AUDD_API_TOKEN. Zero npm deps: multipart body built by hand.
 */

const crypto = require('node:crypto');
const { fetchText } = require('../http');

const META = {
  id: 'audd',
  name: 'AudD',
  type: 'recognition',
  country: 'US',
  languages: ['en'],
  searchSupported: false,
  directLookupSupported: false,
  apiSupported: true,
  scrapingSupported: false,
  priority: 4,
  needsKey: 'AUDD_API_TOKEN',
  baseUrl: 'https://audd.io',
  enabled: true,
};

const API_URL = 'https://api.audd.io/';

/** Manual multipart/form-data body (no deps). */
function buildMultipart(fields, files) {
  const boundary = '----audd' + Date.now().toString(16) + crypto.randomBytes(8).toString('hex');
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value == null) continue;
    parts.push(Buffer.from(
      '--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + value + '\r\n',
      'utf8'));
  }
  for (const f of files || []) {
    parts.push(Buffer.from(
      '--' + boundary + '\r\nContent-Disposition: form-data; name="' + f.name + '"; filename="' + f.filename +
      '"\r\nContent-Type: ' + f.contentType + '\r\n\r\n',
      'utf8'));
    parts.push(f.data);
    parts.push(Buffer.from('\r\n', 'utf8'));
  }
  parts.push(Buffer.from('--' + boundary + '--\r\n', 'utf8'));
  return { body: Buffer.concat(parts), contentType: 'multipart/form-data; boundary=' + boundary };
}

function mapTrack(r) {
  return {
    title: r.title || null,
    artist: r.artist || null,
    album: r.album || null,
    release_date: r.release_date || null,
    label: r.label || null,
    timecode: r.timecode || null,
    song_link: r.song_link || null,
    spotify: r.spotify ? { id: r.spotify.id || null, uri: r.spotify.uri || null, preview_url: r.spotify.preview_url || null } : null,
    apple_music: r.apple_music ? { url: r.apple_music.url || null, preview_url: r.apple_music.preview_url || null } : null,
    deezer: r.deezer ? { link: r.deezer.link || null } : null,
    raw: r,
  };
}

/**
 * Identify an audio sample.
 * buffer: Buffer/Uint8Array of audio (~<=12s for the standard endpoint).
 * opts.url: alternatively recognize a file by public URL (no buffer needed).
 * opts.return: extras, default "apple_music,spotify". opts.market: default "us".
 */
async function identify(buffer, mime, opts = {}) {
  const started = Date.now();
  const token = (opts && opts.token) || process.env.AUDD_API_TOKEN || '';
  if (!token) {
    return { status: 'auth_required', track: null, confidence: null, note: 'Set AUDD_API_TOKEN (token from https://dashboard.audd.io).' };
  }

  const fields = {
    api_token: token,
    return: (opts && opts.return) || 'apple_music,spotify',
    market: (opts && opts.market) || 'us',
  };
  let files = [];
  if (opts && opts.url) {
    fields.url = opts.url;
  } else {
    if (!buffer || !(buffer instanceof Buffer || buffer instanceof Uint8Array) || buffer.length === 0) {
      return { status: 'error', track: null, confidence: null, note: 'identify() needs an audio buffer (or opts.url for a public file URL).' };
    }
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    files = [{ name: 'file', filename: 'sample.bin', contentType: mime || 'application/octet-stream', data }];
  }

  const { body, contentType } = buildMultipart(fields, files);
  let r;
  try {
    r = await fetchText(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': contentType, Accept: 'application/json, */*' },
      body,
      retries: 0,
      timeout: (opts && opts.timeout) || 45000,
    });
  } catch (e) {
    return { status: 'error', track: null, confidence: null, note: 'Network error calling AudD: ' + String((e && e.message) || e) };
  }

  let data = null;
  try { data = JSON.parse(r.text); } catch (e) { /* fall through */ }
  if (!data || typeof data !== 'object') {
    return { status: 'error', track: null, confidence: null, note: 'AudD returned non-JSON (http ' + r.status + ').' };
  }
  if (data.status === 'error') {
    const ec = data.error && data.error.error_code;
    const em = data.error && data.error.error_message;
    if (ec === 900 || ec === 901) {
      return { status: 'auth_required', track: null, confidence: null, note: 'AudD rejected the token (' + ec + ': ' + em + '). Check AUDD_API_TOKEN.' };
    }
    return { status: 'error', track: null, confidence: null, note: 'AudD error ' + ec + ': ' + em, latencyMs: Date.now() - started };
  }
  const res = data.result;
  if (res && (res.title || res.artist)) {
    const track = mapTrack(res);
    return {
      status: 'success',
      track,
      confidence: null, // AudD does not return a numeric confidence
      note: 'Matched "' + (track.title || '?') + '" by ' + (track.artist || '?') + '.',
      latencyMs: Date.now() - started,
    };
  }
  return { status: 'no_match', track: null, confidence: null, note: 'AudD found no match for the audio.', latencyMs: Date.now() - started };
}

async function search() {
  return { status: 'auth_required', results: [], note: 'Audio input required — use identify(). AudD needs AUDD_API_TOKEN.' };
}

async function lookup() {
  return null;
}

async function health() {
  const started = Date.now();
  const token = process.env.AUDD_API_TOKEN || '';
  if (!token) {
    return { status: 'auth_required', latencyMs: Date.now() - started, note: 'Set AUDD_API_TOKEN (token from https://dashboard.audd.io).' };
  }
  // Keys present: verify reachability + token validity with a no-audio POST.
  // Server replies with a "no input" error (not an auth error) when the token
  // is fine, which is enough to prove the endpoint and key shape.
  const { body, contentType } = buildMultipart({ api_token: token }, []);
  try {
    const r = await fetchText(API_URL, {
      method: 'POST', headers: { 'Content-Type': contentType, Accept: 'application/json, */*' },
      body, retries: 0, timeout: 20000,
    });
    let code = null, em = '';
    try { const d = JSON.parse(r.text); code = d.error && d.error.error_code; em = d.error && d.error.error_message; } catch (e) {}
    if (code === 900 || code === 901) {
      return { status: 'auth_required', latencyMs: Date.now() - started, note: 'api.audd.io reachable but token rejected (' + code + ': ' + em + ').' };
    }
    if (r.ok) {
      return { status: 'degraded', latencyMs: Date.now() - started, note: 'api.audd.io reachable; no audio sent, so the key is not fully validated (' + code + ': ' + em + ').' };
    }
    return { status: 'blocked', latencyMs: Date.now() - started, note: 'api.audd.io not reachable (http ' + r.status + (r.error ? ', ' + r.error : '') + ').' };
  } catch (e) {
    return { status: 'error', latencyMs: Date.now() - started, note: 'Health probe failed: ' + String((e && e.message) || e) };
  }
}

module.exports = { META, search, lookup, health, identify };
