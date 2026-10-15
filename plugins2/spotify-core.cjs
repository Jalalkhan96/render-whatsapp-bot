'use strict';

/**
 * Spotify helper used only by the new -sp / -splt* command family.
 *
 * Scope: public Spotify metadata + Spotify-provided official 30s preview URLs.
 * This module deliberately does not implement full-track ripping.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UA = process.env.SPOTIFY_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TOP = 5;
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 100;
const sessions = new Map();

function cleanText(value, max = 500) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeName(value, max = 80) {
  return cleanText(value, max)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[^\p{L}\p{N}\-_.,()'& ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || 'untitled';
}

function msToClock(ms) {
  const n = Number(ms) || 0;
  const s = Math.max(0, Math.round(n / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function firstImage(node) {
  const sources = node?.coverArt?.sources || node?.images || [];
  if (!Array.isArray(sources) || !sources.length) return null;
  return sources[0]?.url || sources[sources.length - 1]?.url || null;
}

function artistsOf(node) {
  const arr = Array.isArray(node?.artists)
    ? node.artists.map(a => a?.name).filter(Boolean)
    : [];
  if (arr.length) return arr.join(', ');
  return cleanText(node?.subtitle || node?.artistsString || '', 200)
    .replace(/\u00a0/g, ' ')
    .replace(/,\s*/g, ', ');
}

function trackFromNode(node) {
  const uri = String(node?.uri || '');
  const id = uri.startsWith('spotify:track:')
    ? uri.split(':').pop()
    : String(node?.id || '').match(/^[A-Za-z0-9]{22}$/)?.[0] || '';
  return {
    id,
    title: cleanText(node?.title || node?.name || 'Unknown', 160),
    artists: artistsOf(node),
    duration_ms: Number(node?.duration || node?.duration_ms || 0) || 0,
    duration: msToClock(node?.duration || node?.duration_ms || 0),
    url: id ? `https://open.spotify.com/track/${id}` : (node?.url || null),
    preview_url: node?.audioPreview?.url || node?.preview_url || null,
    preview_format: node?.audioPreview?.format || null,
    cover: firstImage(node),
    playable: node?.isPlayable !== false,
    explicit: !!node?.isExplicit,
  };
}

function entityLink(node, kind) {
  const id = String(node?.uri || '').split(':').pop();
  if (!id || !/^[A-Za-z0-9]+$/.test(id)) return null;
  return `https://open.spotify.com/${kind}/${id}`;
}

async function fetchText(url, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
      timeout: timeoutMs,
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        fetchText(next, timeoutMs).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Spotify returned HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 15 * 1024 * 1024) req.destroy(new Error('Spotify page is too large'));
      });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('Spotify request timed out')));
    req.on('error', reject);
  });
}

async function downloadFile(url, dest, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA }, timeout: timeoutMs }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        downloadFile(next, dest, timeoutMs).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Preview download returned HTTP ${res.statusCode}`));
        return;
      }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      const fail = err => {
        ws.destroy();
        try { fs.unlinkSync(dest); } catch { /* ignore */ }
        reject(err);
      };
      req.on('error', fail);
      ws.on('error', fail);
      ws.on('finish', () => resolve(dest));
    });
    req.on('timeout', () => req.destroy(new Error('Preview download timed out')));
    req.on('error', reject);
  });
}

function parseNextData(html) {
  const text = String(html || '');
  const m = text.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function walkObjects(root, visit, seen = new Set()) {
  if (!root || typeof root !== 'object' || seen.has(root)) return;
  seen.add(root);
  visit(root);
  if (Array.isArray(root)) {
    for (const item of root) walkObjects(item, visit, seen);
  } else {
    for (const value of Object.values(root)) walkObjects(value, visit, seen);
  }
}

function collectSearchItems(data) {
  const tracks = [];
  const collections = [];
  const seenTrack = new Set();
  const seenCollection = new Set();

  walkObjects(data, node => {
    const uri = String(node?.uri || '');
    const type = String(node?.type || '').toLowerCase();
    if (uri.startsWith('spotify:track:') || type === 'track') {
      const item = trackFromNode(node);
      if (item.id && !seenTrack.has(item.id) && item.title !== 'Unknown') {
        seenTrack.add(item.id);
        tracks.push(item);
      }
    }
    if (uri.startsWith('spotify:playlist:') || type === 'playlist' ||
        uri.startsWith('spotify:album:') || type === 'album') {
      const kind = uri.startsWith('spotify:album:') || type === 'album' ? 'album' : 'playlist';
      const url = entityLink(node, kind) || node?.url || null;
      if (url && !seenCollection.has(url)) {
        seenCollection.add(url);
        collections.push({
          kind,
          id: String(uri).split(':').pop(),
          name: cleanText(node?.name || node?.title || '', 160),
          url,
          cover: firstImage(node),
        });
      }
    }
  });

  return { tracks: tracks.slice(0, TOP), collections: collections.slice(0, TOP) };
}

async function searchSpotify(query, limit = TOP) {
  const q = cleanText(query, 120);
  if (!q) throw new Error('Song search query is empty.');
  const url = `https://open.spotify.com/search/${encodeURIComponent(q)}`;
  const html = await fetchText(url);
  const next = parseNextData(html);
  const items = collectSearchItems(next || {});
  if (!items.tracks.length && !items.collections.length) {
    throw new Error('Spotify search returned no parseable public results.');
  }
  return {
    query: q,
    tracks: items.tracks.slice(0, limit),
    collections: items.collections.slice(0, limit),
  };
}

function parseCollectionUrl(input) {
  const s = String(input || '').trim();
  const m = s.match(/open\.spotify\.com\/(playlist|album)\/([A-Za-z0-9]+)/i);
  if (!m) return null;
  return { kind: m[1].toLowerCase(), id: m[2] };
}

async function getEntity(kind, id) {
  const html = await fetchText(`https://open.spotify.com/embed/${kind}/${id}`);
  const next = parseNextData(html);
  const entity = next?.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error('Spotify embed did not contain public entity data.');
  return entity;
}

async function scrapePlaylist(input) {
  const direct = parseCollectionUrl(input);
  let target = direct;
  if (!target) {
    const found = await searchSpotify(input, TOP);
    target = found.collections[0];
    if (!target) throw new Error(`No public Spotify playlist/album found for "${cleanText(input, 80)}".`);
  }

  const entity = await getEntity(target.kind, target.id);
  const list = Array.isArray(entity?.trackList) ? entity.trackList : [];
  if (!list.length) throw new Error('The playlist/album is empty, private, or not parseable.');

  const tracks = list.map(trackFromNode).filter(t => t.id || t.url);
  return {
    kind: entity?.type || target.kind,
    name: cleanText(entity?.name || entity?.title || target.name || 'Spotify Playlist', 180),
    id: entity?.id || target.id,
    url: `https://open.spotify.com/${target.kind}/${target.id}`,
    cover: firstImage(entity),
    total: tracks.length,
    scraped_at: new Date().toISOString(),
    tracks,
  };
}

function playlistTxt(data) {
  const lines = [
    `${data.name} — ${data.total} tracks`,
    `URL: ${data.url}`,
    `Scraped: ${data.scraped_at}`,
    '',
  ];
  data.tracks.forEach((t, i) => {
    lines.push(`${String(i + 1).padStart(3, '0')}. ${t.title} — ${t.artists} [${t.duration}]`);
    if (t.url) lines.push(`     ${t.url}`);
  });
  return lines.join('\n') + '\n';
}

function playlistCsv(data) {
  const cols = ['n', 'title', 'artists', 'duration', 'url', 'preview_url', 'playable', 'explicit'];
  const esc = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  return [cols.join(','), ...data.tracks.map((t, i) =>
    [i + 1, t.title, t.artists, t.duration, t.url, t.preview_url, t.playable, t.explicit].map(esc).join(','))].join('\n') + '\n';
}

async function zipPlaylist(data, tmpDir, options = {}) {
  let JSZip;
  try { JSZip = require('jszip'); } catch {
    throw new Error('JSZip is not installed. Run: npm install jszip');
  }

  const maxPreviewTracks = Number(options.maxPreviewTracks || process.env.SPOTIFY_ZIP_MAX_PREVIEWS || 100);
  const maxPreviewBytes = Number(options.maxPreviewBytes || process.env.SPOTIFY_ZIP_MAX_BYTES || (40 * 1024 * 1024));
  fs.mkdirSync(tmpDir, { recursive: true });

  const zip = new JSZip();
  zip.file('playlist.txt', playlistTxt(data));
  zip.file('playlist.json', JSON.stringify(data, null, 2));
  zip.file('playlist.csv', playlistCsv(data));

  let used = 0;
  let previewCount = 0;
  const skipped = [];
  const previewDir = path.join(tmpDir, `sp-${crypto.randomBytes(5).toString('hex')}`);
  fs.mkdirSync(previewDir, { recursive: true });

  try {
    for (let i = 0; i < data.tracks.length; i++) {
      const track = data.tracks[i];
      if (!track.preview_url) { skipped.push({ n: i + 1, reason: 'No official preview URL' }); continue; }
      if (previewCount >= maxPreviewTracks) { skipped.push({ n: i + 1, reason: 'Preview count safety limit reached' }); continue; }

      const file = path.join(previewDir, `${String(i + 1).padStart(3, '0')}-${safeName(`${track.title} - ${track.artists}`, 75)}.mp3`);
      try {
        await downloadFile(track.preview_url, file);
        const bytes = fs.statSync(file).size;
        if (used + bytes > maxPreviewBytes) {
          skipped.push({ n: i + 1, reason: 'ZIP preview size safety limit reached' });
          try { fs.unlinkSync(file); } catch { /* ignore */ }
          continue;
        }
        used += bytes;
        previewCount++;
        zip.file(`previews/${path.basename(file)}`, fs.readFileSync(file));
      } catch (err) {
        skipped.push({ n: i + 1, reason: cleanText(err.message, 120) });
      } finally {
        try { fs.unlinkSync(file); } catch { /* ignore */ }
      }
    }

    zip.file('preview-report.json', JSON.stringify({
      playlist: data.name,
      official_preview_files: previewCount,
      skipped,
      generated_at: new Date().toISOString(),
      note: 'Audio files in this archive are only Spotify-provided official preview samples when available.',
    }, null, 2));

    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  } finally {
    try { fs.rmSync(previewDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function createSession(chatId, items) {
  const now = Date.now();
  for (const [key, state] of sessions) {
    if (now - state.at > SESSION_TTL_MS) sessions.delete(key);
  }
  while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  const token = crypto.randomBytes(5).toString('hex');
  sessions.set(token, { chatId, items, at: now });
  return token;
}

function getSession(token, chatId) {
  const state = sessions.get(String(token || ''));
  if (!state || state.chatId !== chatId || Date.now() - state.at > SESSION_TTL_MS) {
    if (token) sessions.delete(String(token));
    return null;
  }
  return state;
}

module.exports = {
  TOP,
  cleanText,
  safeName,
  msToClock,
  fetchText,
  downloadFile,
  searchSpotify,
  scrapePlaylist,
  playlistTxt,
  playlistCsv,
  zipPlaylist,
  createSession,
  getSession,
};
