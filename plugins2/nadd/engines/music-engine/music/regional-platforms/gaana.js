'use strict';
/**
 * Gaana adapter — India (regional-platforms).
 * Verified live 2026-10-05: search results are server-rendered HTML cards at
 *   https://gaana.com/search/songs/<query>
 *   <article class="cardArticle ..."> ... <a href="/song/<seokey>">Title</a>
 * Song pages embed schema.org MusicRecording JSON-LD used by lookup().
 * Cards carry no artist/duration; lookup() enriches via the song page.
 */
const { fetchText, sleep } = require('../http');
const { cleanText, absUrl, openGraph, jsonLdMusicNode, durationToMs } = require('../html');

const META = {
  id: 'gaana', name: 'Gaana', type: 'regional-platforms', country: 'IN',
  languages: ['hi', 'en', 'pa', 'te', 'ta', 'mr', 'bn', 'ur'],
  searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 5, needsKey: null,
  baseUrl: 'https://gaana.com', enabled: true,
};

const searchUrl = (q) => 'https://gaana.com/search/songs/' + encodeURIComponent(q);

function parseCards(html) {
  const out = [];
  const re = /<article class="cardArticle[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    const card = m[0];
    const linkM = /href="(\/song\/[a-z0-9-]+)"/i.exec(card);
    if (!linkM) continue;
    const titleM = /<h3><a[^>]*>([\s\S]*?)<\/a><\/h3>/i.exec(card);
    const imgM = /<img[^>]*src="([^"]+)"[^>]*alt=/i.exec(card);
    let cover = imgM ? imgM[1] : null;
    if (cover && /cardDefaultImg/i.test(cover)) cover = null; // placeholder, not real artwork
    const title = titleM ? cleanText(titleM[1]) : '';
    if (!title) continue;
    out.push({
      title,
      artist: '',
      artists: [],
      album: '',
      durationMs: null,
      releaseDate: null,
      year: null,
      isrc: null,
      genre: null,
      language: null,
      cover,
      label: null,
      writers: [],
      producers: [],
      url: absUrl('https://gaana.com', linkM[1]),
      sourceId: linkM[1].replace('/song/', ''),
      source: 'gaana',
      extra: { type: 'song', enriched: false },
    });
  }
  return out;
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  const q = String(query || '').trim();
  if (!q) return { status: 'ok', results: [], note: 'empty query' };
  const r = await fetchText(searchUrl(q), { retries: 1 });
  if (!r.ok) {
    if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', results: [], note: 'Gaana search timed out' };
    return { status: 'error', results: [], note: 'Gaana search HTTP ' + r.status };
  }
  const cards = parseCards(r.text);
  return { status: 'ok', results: cards.slice(0, limit) };
}

function toSongPage(urlOrId) {
  const s = String(urlOrId || '').trim();
  if (!s) return null;
  const m = /gaana\.com\/song\/([a-z0-9-]+)/i.exec(s);
  if (m) return 'https://gaana.com/song/' + m[1];
  if (/^[a-z0-9-]+$/i.test(s)) return 'https://gaana.com/song/' + s;
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
  const rel = node && node.releasedEvent ? node.releasedEvent : null;
  return {
    title: cleanText((node && node.name) || (og['og:title'] || '').split(' MP3')[0]),
    artist: artistNames.join(', '),
    artists: artistNames,
    album: node && node.inAlbum ? cleanText(node.inAlbum.name || '') : '',
    durationMs: durationToMs((node && node.duration) || og['music:duration']),
    releaseDate: (rel && rel.name) || null,
    year: rel && rel.name ? parseInt(String(rel.name).slice(0, 4), 10) || null : null,
    isrc: null,
    genre: null,
    language: (node && node.inLanguage) || null,
    cover: (node && node.image) || og['og:image'] || null,
    label: null,
    writers: [],
    producers: [],
    url: (node && node.url) || og['og:url'] || page,
    sourceId: page.split('/song/')[1] || null,
    source: 'gaana',
    extra: { type: 'song', enriched: true },
  };
}

async function health() {
  const t = Date.now();
  const r = await fetchText(searchUrl('Pasoori'), { retries: 0 });
  return {
    status: r.ok ? 'ok' : 'error',
    latencyMs: Date.now() - t,
    note: r.ok ? 'search page reachable (HTTP 200)' : 'search page HTTP ' + r.status,
  };
}

module.exports = { META, search, lookup, health };
