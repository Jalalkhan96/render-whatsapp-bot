'use strict';
/**
 * ACRCloud audio-recognition adapter — REAL signed implementation.
 *
 * Implements the official ACRCloud Identify Protocol v1 (verified against
 * https://docs.acrcloud.com/reference/identification-api/identification-api):
 *
 *   string_to_sign = "POST\n/v1/identify\n<access_key>\naudio\n1\n<timestamp>"
 *   signature      = base64( HMAC-SHA1(access_secret, string_to_sign) )
 *
 *   POST https://<ACRCLOUD_HOST>/v1/identify  (multipart/form-data)
 *     sample            : audio bytes (filename "sample")
 *     access_key        : project access key
 *     sample_bytes      : buffer length
 *     timestamp         : seconds since epoch
 *     signature         : as above
 *     data_type         : "audio"
 *     signature_version : "1"
 *
 * Success body: { status: { msg, code: 0 }, metadata: { music: [ { title,
 *   artists: [{name}], album: {name}, release_date, duration_ms,
 *   external_ids: {isrc, upc, ...},
 *   external_metadata: { spotify: {track:{id}}, youtube: {vid}, deezer: {track:{id}} },
 *   score, play_offset_ms } ] } }
 *
 * Env: ACRCLOUD_ACCESS_KEY, ACRCLOUD_SECRET, ACRCLOUD_HOST
 *      (e.g. ACRCLOUD_HOST=identify-eu-west-1.acrcloud.com)
 * Zero npm deps: multipart body built by hand, signature via node:crypto.
 */

const crypto = require('node:crypto');
const { fetchText, sleep } = require('../http');

const META = {
  id: 'acrcloud',
  name: 'ACRCloud',
  type: 'recognition',
  country: 'CN',
  languages: ['en'],
  searchSupported: false,
  directLookupSupported: false,
  apiSupported: true,
  scrapingSupported: false,
  priority: 1,
  needsKey: 'ACRCLOUD_ACCESS_KEY,ACRCLOUD_SECRET,ACRCLOUD_HOST',
  baseUrl: 'https://www.acrcloud.com',
  enabled: true,
};

const ENDPOINT = '/v1/identify';
const DATA_TYPE = 'audio';
const SIG_VERSION = '1';
const MAX_SAMPLE_BYTES = 3 * 1024 * 1024; // docs advise <5MB and ~<=15s; 3MB is safe

function keys(opts) {
  return {
    accessKey: (opts && opts.accessKey) || process.env.ACRCLOUD_ACCESS_KEY || '',
    secret: (opts && opts.secret) || process.env.ACRCLOUD_SECRET || '',
    host: (opts && opts.host) || process.env.ACRCLOUD_HOST || '',
  };
}

function missingKeys(k) {
  const missing = [];
  if (!k.accessKey) missing.push('ACRCLOUD_ACCESS_KEY');
  if (!k.secret) missing.push('ACRCLOUD_SECRET');
  if (!k.host) missing.push('ACRCLOUD_HOST');
  return missing;
}

/** Official signature: base64(HMAC-SHA1(secret, "POST\n/v1/identify\n<key>\naudio\n1\n<ts>")). */
function buildSignature(secret, accessKey, timestamp) {
  const stringToSign = ['POST', ENDPOINT, accessKey, DATA_TYPE, SIG_VERSION, timestamp].join('\n');
  return crypto.createHmac('sha1', secret).update(Buffer.from(stringToSign, 'utf8')).digest('base64');
}

/** Manual multipart/form-data body (no deps). fields: {name: string}, files: {name, filename, contentType, data:Buffer}. */
function buildMultipart(fields, files) {
  const boundary = '----acrcloud' + Date.now().toString(16) + crypto.randomBytes(8).toString('hex');
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      '--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + value + '\r\n',
      'utf8'));
  }
  for (const f of files) {
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

function mimeToExt(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('flac')) return 'flac';
  return 'bin';
}

function mapTrack(m) {
  const artists = Array.isArray(m.artists) ? m.artists.map((a) => a && a.name).filter(Boolean) : [];
  const ext = m.external_metadata || {};
  return {
    title: m.title || null,
    artist: artists.join(', ') || null,
    artists,
    album: (m.album && m.album.name) || null,
    release_date: m.release_date || null,
    duration_ms: typeof m.duration_ms === 'number' ? m.duration_ms : null,
    score: typeof m.score === 'number' ? m.score : null,
    external_ids: m.external_ids || {},
    spotify: ext.spotify && ext.spotify.track ? { id: ext.spotify.track.id || null } : null,
    youtube: ext.youtube ? { vid: ext.youtube.vid || null } : null,
    deezer: ext.deezer && ext.deezer.track ? { id: ext.deezer.track.id || null } : null,
    raw: m,
  };
}

/**
 * Identify an audio sample.
 * buffer: Buffer/Uint8Array of audio (<= ~15s recommended). mime: audio mimetype.
 */
async function identify(buffer, mime, opts = {}) {
  const started = Date.now();
  const k = keys(opts);
  const missing = missingKeys(k);
  if (missing.length) {
    return {
      status: 'auth_required',
      track: null,
      confidence: null,
      note: 'Set ' + missing.join(', ') + ' (ACRCloud project access key, secret and identify host).',
    };
  }
  if (!buffer || !(buffer instanceof Buffer || buffer instanceof Uint8Array) || buffer.length === 0) {
    return { status: 'error', track: null, confidence: null, note: 'identify() requires a non-empty audio buffer.' };
  }
  let sample = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let trimmedNote = '';
  if (sample.length > MAX_SAMPLE_BYTES) {
    sample = sample.slice(0, MAX_SAMPLE_BYTES);
    trimmedNote = ' Sample trimmed to ' + MAX_SAMPLE_BYTES + ' bytes (ACRCloud advises <5MB / ~15s).';
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = buildSignature(k.secret, k.accessKey, timestamp);
  const { body, contentType } = buildMultipart(
    {
      access_key: k.accessKey,
      sample_bytes: String(sample.length),
      timestamp,
      signature,
      data_type: DATA_TYPE,
      signature_version: SIG_VERSION,
    },
    [{ name: 'sample', filename: 'sample.' + mimeToExt(mime), contentType: mime || 'application/octet-stream', data: sample }]
  );

  const url = 'https://' + k.host.replace(/^https?:\/\//, '').replace(/\/+$/, '') + ENDPOINT;
  let r;
  try {
    r = await fetchText(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType, Accept: 'application/json, */*' },
      body,
      retries: 0,
      timeout: opts.timeout || 45000,
    });
  } catch (e) {
    return { status: 'error', track: null, confidence: null, note: 'Network error calling ACRCloud: ' + String((e && e.message) || e) };
  }

  let data = null;
  try { data = JSON.parse(r.text); } catch (e) { /* fall through */ }
  const code = data && data.status && data.status.code;
  const msg = data && data.status && data.status.msg;

  if (code === 0) {
    const music = data && data.metadata && Array.isArray(data.metadata.music) ? data.metadata.music : [];
    if (music.length) {
      const track = mapTrack(music[0]);
      return {
        status: 'success',
        track,
        confidence: track.score != null ? track.score / 100 : null,
        note: 'Matched "' + (track.title || '?') + '" by ' + (track.artist || '?') + ' (score ' + (track.score != null ? track.score : '?') + ').' + trimmedNote,
        latencyMs: Date.now() - started,
      };
    }
    return { status: 'no_match', track: null, confidence: null, note: 'ACRCloud returned no music matches (code 0, empty music list).' + trimmedNote };
  }
  if (code === 1001 || code === 2004) {
    return { status: 'no_match', track: null, confidence: null, note: 'ACRCloud: no recognition result (' + msg + ', code ' + code + ').' + trimmedNote };
  }
  if (code === 2000 || code === 2001) {
    return { status: 'auth_required', track: null, confidence: null, note: 'ACRCloud rejected the credentials (' + msg + ', code ' + code + '). Check ACRCLOUD_ACCESS_KEY / ACRCLOUD_SECRET.' };
  }
  return {
    status: 'error',
    track: null,
    confidence: null,
    note: 'ACRCloud error: ' + (msg || ('http_' + r.status)) + ' (code ' + (code != null ? code : 'n/a') + ', http ' + r.status + ').',
    latencyMs: Date.now() - started,
  };
}

async function search() {
  return { status: 'auth_required', results: [], note: 'Audio input required — use identify(). ACRCloud needs ACRCLOUD_ACCESS_KEY, ACRCLOUD_SECRET, ACRCLOUD_HOST.' };
}

async function lookup() {
  return null;
}

async function health() {
  const started = Date.now();
  const k = keys({});
  const missing = missingKeys(k);
  if (missing.length) {
    return { status: 'auth_required', latencyMs: Date.now() - started, note: 'Set ' + missing.join(', ') + ' to enable ACRCloud recognition.' };
  }
  // Keys present: probe with a minimal signed request. The sample is tiny and
  // invalid audio, so no real recognition is consumed; we only check the
  // server's auth/signature verdict to prove the signed flow works.
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = buildSignature(k.secret, k.accessKey, timestamp);
  const { body, contentType } = buildMultipart(
    { access_key: k.accessKey, sample_bytes: '64', timestamp, signature, data_type: DATA_TYPE, signature_version: SIG_VERSION },
    [{ name: 'sample', filename: 'sample.bin', contentType: 'application/octet-stream', data: Buffer.alloc(64) }]
  );
  try {
    const r = await fetchText('https://' + k.host.replace(/^https?:\/\//, '').replace(/\/+$/, '') + ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': contentType, Accept: 'application/json, */*' },
      body, retries: 0, timeout: 20000,
    });
    let code = null, msg = '';
    try { const d = JSON.parse(r.text); code = d.status && d.status.code; msg = d.status && d.status.msg; } catch (e) {}
    if (code === 2000 || code === 2001 || r.status === 401 || r.status === 403) {
      return { status: 'auth_required', latencyMs: Date.now() - started, note: 'ACRCloud host reachable but credentials rejected (' + msg + ', code ' + code + ').' };
    }
    if (r.ok || (code != null && code !== 2000 && code !== 2001)) {
      return { status: 'degraded', latencyMs: Date.now() - started, note: 'ACRCloud host reachable and signature accepted for auth check (' + msg + ', code ' + code + '); full identify() needs a real audio sample.' };
    }
    return { status: 'blocked', latencyMs: Date.now() - started, note: 'ACRCloud host not reachable (http ' + r.status + (r.error ? ', ' + r.error : '') + ').' };
  } catch (e) {
    return { status: 'error', latencyMs: Date.now() - started, note: 'Health probe failed: ' + String((e && e.message) || e) };
  }
}

// internal seam for tests (not part of the public contract)
async function _selfTest() {
  // verify signature construction is byte-correct per official JS reference
  const sig = buildSignature('testsecret', 'testkey', '1700000000');
  const expected = crypto.createHmac('sha1', 'testsecret')
    .update(Buffer.from('POST\n/v1/identify\ntestkey\naudio\n1\n1700000000', 'utf8'))
    .digest('base64');
  return { signatureMatchesOfficialFormula: sig === expected };
}

module.exports = { META, search, lookup, health, identify, _selfTest };
