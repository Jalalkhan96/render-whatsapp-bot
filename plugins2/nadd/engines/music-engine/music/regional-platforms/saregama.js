'use strict';
/**
 * Saregama adapter — India (regional-platforms).
 * Verified live 2026-10-05: song search is server-rendered HTML at
 *   https://www.saregama.com/search/song?s=<query>   (X-PJAX header)
 * Result rows: <a class="srgm_wrap song_title" href="https://www.saregama.com/song/<slug>_<id>">
 * Song pages embed schema.org MusicRecording JSON-LD + og:audio + music:duration.
 */
const { fetchText, sleep } = require('../http');
const { cleanText, openGraph, jsonLdMusicNode, durationToMs } = require('../html');

const META = {
  id: 'saregama', name: 'Saregama', type: 'regional-platforms', country: 'IN',
  languages: ['hi', 'en', 'bn', 'ta', 'te', 'mr', 'pa'],
  searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 9, needsKey: null,
  baseUrl: 'https://www.saregama.com', enabled: true,
};

const searchUrl = (q) => 'https://www.saregama.com/search/song?s=' + encodeURIComponent(q);

function parseResults(html) {
  const out = [];
  const blocks = String(html || '').split('class="tlte"');
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i].slice(0, 4000); // one result row; never hold the full page
    const songM = /<a[^>]*href="([^"]+)"[^>]*class="srgm_wrap song_title"[^>]*>([\s\S]*?)<\/a>/i.exec(b);
    if (!songM) continue;
    const songUrl = songM[1];
    const title = cleanText(songM[2]);
    if (!title) continue;
    const albM = /<h3 class="subTitle">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/i.exec(b);
    let album = '', albumUrl = '';
    if (albM) {
      const aTag = albM[0];
      const urlM = /href=(["']?)(https?:\/\/[^"'\s>]+)\1/i.exec(aTag);
      const tM = /title=(["'])(.*?)\1/i.exec(aTag);
      albumUrl = urlM ? urlM[2] : '';
      album = cleanText((tM && tM[2]) || albM[1]);
    }
    const idM = /_(\d+)$/.exec(songUrl);
    out.push({
      title,
      artist: '',
      artists: [],
      album,
      durationMs: null,
      releaseDate: null,
      year: null,
      isrc: null,
      genre: null,
      language: null,
      cover: null,
      label: null,
      writers: [],
      producers: [],
      url: songUrl,
      sourceId: idM ? idM[1] : null,
      source: 'saregama',
      extra: { type: 'song', albumUrl: albumUrl || null, enriched: false },
    });
  }
  return out;
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const r = await fetchText(searchUrl(q), { headers: { 'X-PJAX': 'true' }, retries: 1 });
  if (!r.ok) {
    if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', results: [], note: 'Saregama search timed out' };
    return { status: 'error', results: [], note: 'Saregama search HTTP ' + r.status };
  }
  const rows = parseResults(r.text);
  return { status: 'ok', results: rows.slice(0, limit) };
}

function toSongPage(urlOrId) {
  const s = String(urlOrId || '').trim();
  if (!s) return null;
  const m = /saregama\.com\/song\/([a-z0-9_-]+)/i.exec(s);
  if (m) return 'https://www.saregama.com/song/' + m[1];
  return null;
}

async function lookup(urlOrId, opts = {}) {
  const page = toSongPage(urlOrId);
  if (!page) return null;
  const r = await fetchText(page, { retries: 1 });
  if (!r.ok) return null;
  const html = r.text;
  const node = jsonLdMusicNode(html);
  const og = openGraph(html);
  if (!node && !og['og:title']) return null;
  const byArtist = Array.isArray(node && node.byArtist) ? node.byArtist : (node && node.byArtist ? [node.byArtist] : []);
  const artistNames = byArtist.map((a) => (a && a.name ? cleanText(a.name) : '')).filter(Boolean);
  const album = node && node.inAlbum ? node.inAlbum : null;
  const idM = /_(\d+)$/.exec(page);
  return {
    title: cleanText((node && node.name) || (og['og:title'] || '').split(' MP3')[0]),
    artist: artistNames.join(', '),
    artists: artistNames,
    album: album ? cleanText(album.name || '') : '',
    durationMs: durationToMs((node && node.duration) || og['music:duration']),
    releaseDate: null,
    year: null,
    isrc: null,
    genre: null,
    language: null,
    cover: (node && node.image) || og['og:image'] || null,
    label: 'Saregama',
    writers: [],
    producers: [],
    url: (node && node.url) || og['og:url'] || page,
    sourceId: idM ? idM[1] : null,
    source: 'saregama',
    extra: { type: 'song', albumUrl: album && album.url ? album.url : null, enriched: true },
  };
}

async function health() {
  const t = Date.now();
  const r = await fetchText(searchUrl('Pasoori'), { headers: { 'X-PJAX': 'true' }, retries: 0 });
  return {
    status: r.ok ? 'ok' : 'error',
    latencyMs: Date.now() - t,
    note: r.ok ? 'search page reachable (HTTP 200)' : 'search page HTTP ' + r.status,
  };
}

module.exports = { META, search, lookup, health };
