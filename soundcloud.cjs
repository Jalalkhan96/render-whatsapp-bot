#!/usr/bin/env node
/**
 * soundcloud.cjs — SoundCloud metadata scraper (zero browser)
 *
 * Uses the public metadata endpoint with a client_id discovered from the public website.
 * No developer API key, login, or .env variable is required for metadata lookup.
 *
 * Ideas borrowed (legit parts) from public repos:
 *  - nathom/streamrip : dynamic client_id + app_version extraction
 *  - scdl-org/scdl    : --likes flag, --archive for downloads
 *
 * Download policy: --download only fetches tracks where the artist enabled
 * the official SoundCloud download button. Public official downloads work
 * only public creator-enabled official download endpoints are attempted; auth-gated tracks are skipped.
 * Playback, HLS, and stream URLs are never used as a download fallback.
 *
 * Usage:
 *   npm i axios
 *   node soundcloud.cjs --search "lofi hip hop" [--limit 20] [--out results.json]
 *   node soundcloud.cjs --search "synthwave" --csv --out tracks.csv
 *   node soundcloud.cjs --track <soundcloud-track-url>
 *   node soundcloud.cjs --user <soundcloud-user-url> [--limit 50]
 *   node soundcloud.cjs --likes <soundcloud-user-url> [--limit 50]
 *   node soundcloud.cjs --playlist <soundcloud-playlist-url>
 *   node soundcloud.cjs --search "jazz" --artwork --artdir ./covers
 *   node soundcloud.cjs --search "lofi" --download --dldir ./audio
 *                 ^ only public official creator-enabled downloads; no credentials
 */
'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
const API = 'https://api-v2.soundcloud.com';
const MAX_TRACK_BYTES = 16 * 1024 * 1024; // fixed safety cap; no .env required

const http = axios.create({
  timeout: 30000,
  headers: { 'User-Agent': UA, 'Accept': 'application/json' },
});

/** Extract working client_id + app_version (streamrip's technique, improved).
 *  Takes the last crossorigin bundle first, falls back to trying all. */
async function getAuth() {
  const { data: html } = await http.get('https://soundcloud.com/');
  const appVer = (html.match(/window\.__sc_version="(\d+)"/) || [])[1] || '';
  const bundles = [...html.matchAll(/<script\s+crossorigin\s+src="([^"]+)"/g)].map(m => m[1]);
  const all = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/\d+-[a-f0-9]+\.js/g)].map(m => m[0]);
  const ordered = [...new Set([...bundles.reverse(), ...all])];
  for (const url of ordered) {
    try {
      const full = url.startsWith('http') ? url : `https://soundcloud.com${url}`;
      const { data: js } = await http.get(full, { timeout: 20000 });
      const m = js.match(/client_id:\s*"(\w+)"/) || js.match(/client_id[":]*"([a-zA-Z0-9]{32})"/);
      if (m) return { client_id: m[1], app_version: appVer };
    } catch { /* try next bundle */ }
  }
  throw new Error('Could not extract client_id — SoundCloud may have changed their bundles');
}
/** Backwards-compat wrapper. */
async function getClientId() { return (await getAuth()).client_id; }

/** api-v2 GET with client_id (+ app_version when known). */
function apiGet(auth, path) {
  const cid = typeof auth === 'string' ? auth : auth.client_id;
  const av = typeof auth === 'object' && auth.app_version ? `&app_version=${auth.app_version}` : '';
  const sep = path.includes('?') ? '&' : '?';
  return http.get(`${API}${path}${sep}client_id=${cid}${av}`);
}

/** Follow a next_href, ensuring our auth is attached (API omits client_id). */
function authedNext(auth, next_href) {
  const cid = typeof auth === 'string' ? auth : auth.client_id;
  const av = typeof auth === 'object' && auth.app_version ? `&app_version=${auth.app_version}` : '';
  let u = next_href.replace(/^http:/, 'https:');
  if (!/[?&]client_id=/.test(u)) u += (u.includes('?') ? '&' : '?') + `client_id=${cid}${av}`;
  return http.get(u);
}

/** Flatten a track object to the fields that matter. */
function flatTrack(t) {
  const u = t.user || {};
  const dur = Math.floor((t.duration || 0) / 1000);
  return {
    id: t.id,
    title: t.title || '',
    artist: u.username || '',
    artist_url: u.permalink_url || '',
    url: t.permalink_url || '',
    duration: `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`,
    duration_ms: t.duration || 0,
    genre: t.genre || '',
    plays: t.playback_count || 0,
    likes: t.likes_count || 0,
    reposts: t.reposts_count || 0,
    comments: t.comment_count || 0,
    created: (t.created_at || '').slice(0, 10),
    artwork: (t.artwork_url || '').replace('-large', '-t500x500'),
    streamable: !!t.streamable,
    downloadable: !!t.downloadable,
    // Only use SoundCloud's official download URL when the creator exposes it.
    // Never substitute stream/HLS URLs for a download endpoint.
    download_url: typeof t.download_url === 'string' ? t.download_url : '',
    license: t.license || '',
  };
}

async function searchTracks(auth, query, limit = 20) {
  const out = [];
  let total = 0;
  let nextPath = `/search/tracks?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 200)}`;
  let next = null;
  while (out.length < limit) {
    const { data } = next ? await authedNext(auth, next) : await apiGet(auth, nextPath);
    if (!total) total = data.total_results || 0;
    for (const t of (data.collection || [])) {
      if (t.kind === 'track') { out.push(flatTrack(t)); if (out.length >= limit) break; }
    }
    next = data.next_href || null;
    if (!next) break;
  }
  return { total, tracks: out };
}

async function resolveUrl(auth, url) {
  const { data } = await apiGet(auth, `/resolve?url=${encodeURIComponent(url)}`);
  return data;
}

async function userTracks(auth, userId, limit = 50) {
  return pagedTracks(auth, `/users/${userId}/tracks`, limit);
}

/** NEW (scdl idea): fetch a user's liked tracks. */
async function userLikes(auth, userId, limit = 50) {
  return pagedTracks(auth, `/users/${userId}/likes`, limit, true);
}

async function pagedTracks(auth, basePath, limit, unwrapLikes = false) {
  const out = [];
  let next = null;
  const first = `${basePath}?limit=${Math.min(limit, 200)}&linked_partitioning=1`;
  while (out.length < limit) {
    const { data } = next ? await authedNext(auth, next) : await apiGet(auth, first);
    for (const item of (data.collection || [])) {
      const t = unwrapLikes ? item.track : item;
      if (t && t.kind === 'track') { out.push(flatTrack(t)); if (out.length >= limit) break; }
    }
    next = data.next_href || null;
    if (!next) break;
  }
  return out;
}

/**
 * Download only official creator-enabled downloads. Never use stream/HLS URLs.
 * Responses are streamed to disk with a hard per-track cap to limit RAM use.
 */
async function downloadTracks(auth, tracks, dir, { archive = null } = {}) {
  const cid = typeof auth === 'string' ? auth : auth.client_id;
  const maxTrackBytes = MAX_TRACK_BYTES;
  await fs.promises.mkdir(dir, { recursive: true });

  const seen = new Set();
  if (archive && fs.existsSync(archive)) {
    fs.readFileSync(archive, 'utf8').split('\n').forEach(line => line.trim() && seen.add(line.trim()));
  }
  const mark = id => { if (archive) fs.appendFileSync(archive, `${id}\n`); };
  const files = [];
  let ok = 0, skipped = 0, needAuth = false;

  for (const track of tracks) {
    const id = String(track.id);
    if (seen.has(id) || !track.downloadable) { skipped++; continue; }

    const headers = {};
    const candidates = [];
    if (track.download_url && /^https:\/\/(api-v2\.soundcloud\.com|soundcloud\.com|[a-z0-9.-]*sndcdn\.com)\//i.test(track.download_url)) {
      candidates.push(track.download_url);
    }
    candidates.push(`${API}/tracks/${encodeURIComponent(id)}/download?client_id=${encodeURIComponent(cid)}`);

    let downloaded = false;
    let authRequired = false;
    for (const url of candidates) {
      let response;
      let outputPath = null;
      try {
        response = await http.get(url, {
          headers,
          responseType: 'stream',
          timeout: 60000,
          maxRedirects: 5,
          validateStatus: status => status < 500,
        });
        if (response.status === 401 || response.status === 403) {
          authRequired = true;
          response.data?.destroy?.();
          continue;
        }
        if (response.status !== 200 || !response.data) {
          response.data?.destroy?.();
          continue;
        }

        const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const declaredSize = Number(response.headers['content-length'] || 0);
        if (declaredSize > maxTrackBytes) {
          response.data.destroy();
          throw new Error(`Track exceeds the configured ${Math.round(maxTrackBytes / 1024 / 1024)} MB per-track limit.`);
        }
        if (contentType.includes('text/html') || contentType.includes('json')) {
          response.data.destroy();
          continue;
        }
        if (contentType && !contentType.startsWith('audio/') && contentType !== 'application/octet-stream') {
          response.data.destroy();
          continue;
        }

        const safe = `${track.artist} - ${track.title} [${id}]`
          .replace(/[\\/:*?"<>|]/g, '_')
          .slice(0, 140) || `soundcloud-${id}`;
        const ext = contentType.includes('mpeg') ? '.mp3'
          : contentType.includes('wav') ? '.wav'
          : contentType.includes('ogg') ? '.ogg'
          : (contentType.includes('mp4') || contentType.includes('m4a') || contentType.includes('aac')) ? '.m4a'
          : contentType.includes('webm') ? '.webm'
          : '.mp3';
        outputPath = path.join(dir, `${safe}${ext}`);
        let received = 0;
        const limitStream = new Transform({
          transform(chunk, _encoding, callback) {
            received += chunk.length;
            if (received > maxTrackBytes) callback(new Error(`Track exceeded ${Math.round(maxTrackBytes / 1024 / 1024)} MB while downloading.`));
            else callback(null, chunk);
          },
        });
        await pipeline(response.data, limitStream, fs.createWriteStream(outputPath, { flags: 'wx' }));
        if (!received) throw new Error('SoundCloud returned an empty audio file.');
        seen.add(id);
        mark(id);
        ok++;
        files.push({
          path: outputPath,
          track,
          size: received,
          contentType: contentType.startsWith('audio/') ? contentType : 'audio/mpeg',
        });
        console.log(`  ✓ ${track.title.slice(0, 50)}`);
        downloaded = true;
        break;
      } catch (error) {
        response?.data?.destroy?.();
        if (outputPath) await fs.promises.rm(outputPath, { force: true }).catch(() => {});
        if (/per-track limit|exceeded .* while downloading/i.test(String(error.message))) {
          console.log(`  - ${track.title.slice(0, 50)}: ${error.message}`);
          break;
        }
        // Try another official download endpoint; never fall back to stream/HLS ripping.
      }
    }
    if (!downloaded) {
      skipped++;
      if (authRequired) needAuth = true;
      console.log(`  - ${track.title.slice(0, 50)}: public official download unavailable`);
    }
  }
  return { ok, skipped, needAuth, files };
}

/** Resolve a search, track, playlist, user profile, or liked-tracks URL. */
async function collectTracks(auth, { mode = 'auto', input = '', query = '', limit = 5 } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 5));
  if (mode === 'search') {
    const q = String(query || input || '').trim();
    if (!q) throw new Error('Enter a SoundCloud search query.');
    const result = await searchTracks(auth, q, safeLimit);
    return { auth, kind: 'search', label: q, total: result.total, tracks: result.tracks.slice(0, safeLimit) };
  }
  if (!/^https?:\/\//i.test(String(input || ''))) throw new Error('Provide a valid public SoundCloud URL.');
  const resolved = await resolveUrl(auth, input);
  if (resolved.kind === 'track') {
    if (mode !== 'auto' && mode !== 'track' && mode !== 'download') throw new Error(`That link is a track, not a ${mode}.`);
    return { auth, kind: 'track', label: resolved.title || 'SoundCloud track', tracks: [flatTrack(resolved)] };
  }
  if (resolved.kind === 'playlist') {
    if (mode !== 'auto' && mode !== 'playlist' && mode !== 'download') throw new Error(`That link is a playlist, not a ${mode}.`);
    const tracks = (resolved.tracks || []).filter(item => item && item.kind === 'track').map(flatTrack).slice(0, safeLimit);
    return { auth, kind: 'playlist', label: resolved.title || 'SoundCloud playlist', total: Number(resolved.track_count || tracks.length), tracks };
  }
  if (resolved.kind === 'user') {
    if (mode === 'likes') {
      const tracks = await userLikes(auth, resolved.id, safeLimit);
      return { auth, kind: 'likes', label: resolved.username || 'SoundCloud user', tracks };
    }
    if (mode !== 'auto' && mode !== 'user' && mode !== 'download') throw new Error('Provide a SoundCloud user profile URL.');
    const tracks = await userTracks(auth, resolved.id, safeLimit);
    return { auth, kind: 'user', label: resolved.username || 'SoundCloud user', tracks };
  }
  throw new Error(`This SoundCloud URL resolves to unsupported content type: ${resolved.kind || 'unknown'}.`);
}

async function downloadArtwork(tracks, dir) {
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const t of tracks) {
    if (!t.artwork) continue;
    try {
      const safe = `${t.artist} - ${t.title}`.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
      const file = path.join(dir, `${safe}.jpg`);
      const { data } = await http.get(t.artwork, { responseType: 'arraybuffer', timeout: 20000 });
      fs.writeFileSync(file, Buffer.from(data));
      n++;
    } catch { /* skip failed artwork */ }
  }
  return n;
}

function toCSV(tracks) {
  const cols = ['title', 'artist', 'url', 'duration', 'genre', 'plays', 'likes', 'created'];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...tracks.map(t => cols.map(c => esc(t[c])).join(','))].join('\n');
}

function printTable(tracks) {
  tracks.forEach((t, i) => {
    const dl = t.downloadable ? ' ⬇' : '';
    console.log(`${String(i + 1).padStart(3)}. ${t.title.slice(0, 55)}${dl}`);
    console.log(`     ${t.artist.slice(0, 30)} | ${t.duration} | ▶${t.plays.toLocaleString()} ♥${t.likes.toLocaleString()}`);
    console.log(`     ${t.url}`);
  });
  if (tracks.some(t => t.downloadable))
    console.log('\n⬇ = artist enabled download (use --download to fetch)');
}

/* ---------------- CLI ---------------- */
async function main() {
  const argv = process.argv.slice(2);
  const a = { limit: 20 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--search') a.search = argv[++i];
    else if (k === '--track') a.track = argv[++i];
    else if (k === '--user') a.user = argv[++i];
    else if (k === '--playlist') a.playlist = argv[++i];
    else if (k === '--limit') a.limit = parseInt(argv[++i], 10);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--csv') a.csv = true;
    else if (k === '--txt') a.txt = true;
    else if (k === '--artwork') a.artwork = true;
    else if (k === '--artdir') a.artdir = argv[++i];
    else if (k === '--download') a.download = true;
    else if (k === '--dldir') a.dldir = argv[++i];
        else if (k === '--likes') a.likes = argv[++i];
    else if (k === '--archive') a.archive = argv[++i];
  }

  if (!a.search && !a.track && !a.user && !a.playlist && !a.likes) {
    console.log('Usage:\n' +
      '  node soundcloud.cjs --search "lofi hip hop" [--limit 20] [--out out.json]\n' +
      '  node soundcloud.cjs --search "synthwave" --csv --out tracks.csv\n' +
      '  node soundcloud.cjs --track <track-url> | --user <user-url> | --playlist <playlist-url>\n' +
      '  node soundcloud.cjs --likes <user-url> [--limit 50]   (liked tracks)\n' +
      '  Add --artwork [--artdir ./covers] to download cover art.\n' +
      '  Add --download [--dldir ./audio] [--archive dl.txt] for artist-authorized\n' +
      '  downloads. Public official download links work without login when available.\n' +
      '  Tracks requiring login are skipped; no credentials or .env variables are needed.\n' +
      '  No stream/HLS ripping is performed.');
    process.exit(1);
  }

  console.log('[1/2] extracting client_id + app_version…');
  const auth = await getAuth();
  console.log('[2/2] querying api-v2…');

  let tracks = [], extra = {};

  if (a.search) {
    const r = await searchTracks(auth, a.search, a.limit);
    tracks = r.tracks; extra = { query: a.search, total_results: r.total };
    console.log(`found ${r.total.toLocaleString()} results, showing ${tracks.length}\n`);
  } else {
    const url = a.track || a.user || a.playlist || a.likes;
    const obj = await resolveUrl(auth, url);
    if (obj.kind === 'track') { tracks = [flatTrack(obj)]; }
    else if (obj.kind === 'user') {
      if (a.likes) {
        tracks = await userLikes(auth, obj.id, a.limit);
        extra = { user: obj.username, liked_tracks: tracks.length };
      } else {
        tracks = await userTracks(auth, obj.id, a.limit);
        extra = { user: obj.username, followers: obj.followers_count };
      }
    }
    else if (obj.kind === 'playlist') {
      tracks = (obj.tracks || []).map(flatTrack);
      extra = { playlist: obj.title, track_count: obj.track_count };
    }
    else throw new Error('URL resolved to kind=' + obj.kind + ' — not supported');
  }

  printTable(tracks);

  if (a.artwork) {
    const n = await downloadArtwork(tracks, a.artdir || './covers');
    console.log(`\nartwork: ${n} covers saved`);
  }

  if (a.download) {
    console.log('\ndownloading artist-authorized tracks…');
    const r = await downloadTracks(auth, tracks, a.dldir || './audio', { archive: a.archive });
    console.log(`\ndownloaded: ${r.ok} | skipped: ${r.skipped}` +
      (r.ok === 0 && tracks.some(t => t.downloadable)
        ? '\nNOTE: SoundCloud did not expose a public download for these tracks. ' +
          'Only creator-enabled official downloads are supported; some may require login.'
        : ''));
    if (r.needAuth && r.ok === 0 && tracks.some(t => t.downloadable)) {
      console.log('NOTE: SoundCloud required authentication for the attempted official download. This item was skipped.');
    }
  }

  if (a.out) {
    let content;
    if (a.csv) content = toCSV(tracks);
    else if (a.txt) content = tracks.map(t => `${t.artist} - ${t.title} (${t.duration}) ${t.url}`).join('\n');
    else content = JSON.stringify({ ...extra, count: tracks.length, tracks }, null, 2);
    fs.writeFileSync(a.out, content);
    console.log('saved:', path.resolve(a.out));
  }
}

if (require.main === module) {
  main().catch(e => { console.error('ERROR:', e.message); process.exitCode = 1; });
}

module.exports = { getClientId, getAuth, searchTracks, resolveUrl, userTracks, userLikes, flatTrack, collectTracks, downloadTracks, downloadArtwork };
