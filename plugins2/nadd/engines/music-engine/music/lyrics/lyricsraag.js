'use strict';
/**
 * LyricsRaag adapter — Hindi/Punjabi/Urdu lyrics + English translations (link-only).
 * Verified 2026-10-05: WordPress site (note: www redirects to apex domain).
 * Live server-side search:
 *   GET https://lyricsraag.com/?s=Q
 * Result cards embed artist/movie/album/language metadata in the link text,
 * e.g. "Pasoori 🎤Singers: Ali Sethi, Shae Gill 🌐Language: Urdu".
 * Lookup uses the song page's title + OpenGraph + schema.org MusicRecording
 * (when present) for public metadata. The lyrics body is never extracted.
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, pageTitle, metaContent, openGraph, jsonLdMusicNode } = require('../html');

const META = {
  id: 'lyricsraag', name: 'LyricsRaag', type: 'lyrics', country: 'IN',
  languages: ['hi', 'en'], searchSupported: true, directLookupSupported: true,
  apiSupported: false, scrapingSupported: true, priority: 18, needsKey: null,
  baseUrl: 'https://www.lyricsraag.com', enabled: true,
};

const APEX = 'https://lyricsraag.com';

function namesOf(v) {
  return (Array.isArray(v) ? v : [v]).filter((x) => x && x.name).map((x) => cleanText(x.name)).filter(Boolean);
}

/** Parse "Title 🎤Singers: A, B 🎬Movie: M | 🌐Language: Urdu" style anchor text. */
function parseResultText(text) {
  const title = cleanText(text.split(/🎤|🎬|💿|🌐/).shift() || '');
  const artists = [];
  const sm = /🎤\s*Singers?:\s*([^🎬💿🌐|]+)/i.exec(text);
  if (sm) artists.push(...cleanText(sm[1]).split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean));
  let album = null;
  const mm = /🎬\s*Movie:\s*([^💿🌐|]+)/i.exec(text) || /💿\s*Album:\s*([^🌐|]+)/i.exec(text);
  if (mm) album = cleanText(mm[1]);
  let language = null;
  const lm = /🌐\s*Language:\s*([A-Za-z]+)/i.exec(text);
  if (lm) language = lm[1].toLowerCase();
  return { title, artists, album, language };
}

function isSongLink(href) {
  if (!href) return false;
  const u = absUrl(APEX, href);
  if (!/^https?:\/\/(www\.)?lyricsraag\.com\//i.test(u)) return false;
  const path = u.replace(/^https?:\/\/(www\.)?lyricsraag\.com/i, '').split(/[?#]/)[0];
  if (!path || path === '/' || /\/(category|tag|author|page)\//i.test(path)) return false;
  return true;
}

async function search(query, opts = {}) {
  const limit = Math.max(1, Math.min(opts.limit || 8, 20));
  if (!query || !String(query).trim()) return { status: 'ok', results: [], note: 'empty query' };
  const r = await fetchText(APEX + '/?s=' + encodeURIComponent(String(query).trim()));
  if (!r.ok) {
    if (r.error === 'timeout') return { status: 'timeout', results: [], note: 'request timed out' };
    return { status: 'error', results: [], note: 'http_' + r.status };
  }
  const html = r.text;
  const articles = html.match(/<article[\s\S]*?<\/article>/gi) || [];
  const results = [];
  const seen = new Set();
  for (const art of articles) {
    if (results.length >= limit) break;
    const link = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(art);
    if (!link || !isSongLink(link[1])) continue;
    const url = absUrl(APEX, link[1]).split(/[?#]/)[0];
    if (seen.has(url)) continue;
    seen.add(url);
    const p = parseResultText(cleanText(link[2]));
    if (!p.title) continue;
    const artist = p.artists[0] || '';
    results.push({
      title: p.title, artist, artists: p.artists,
      album: p.album, durationMs: null, releaseDate: null, year: null,
      isrc: null, genre: null, language: null,
      cover: null, label: null, writers: [], producers: [],
      url, sourceId: url, source: META.id,
      lyricsUrl: url, lyricsAvailable: true, licenseStatus: 'link-only',
      extra: p.language ? { language: p.language } : {},
    });
  }
  if (!results.length && !/You searched for/i.test(html)) {
    return { status: 'source_changed', results: [], note: 'search page layout changed; no result articles parsed' };
  }
  return { status: 'ok', results };
}

/** Split "Pasoori Lyrics Translation — Coke Studio | Ali Sethi | Shae Gill". */
function parseLookupTitle(title) {
  const t = cleanText(title).replace(/\s*[-–|]\s*LyricsRaag\.?Com\s*$/i, '');
  let language = null;
  const langMark = /\((Hindi|Punjabi|Urdu|English|Tamil|Telugu|Bhojpuri)\)/i.exec(t);
  if (langMark) language = langMark[1].toLowerCase();
  const parts = t.split(/\s+[—–-]\s+/);
  const head = parts[0] || t;
  const songTitle = cleanText(head
    .replace(/\s*\(?(Hindi|Punjabi|Urdu|English|Tamil|Telugu|Bhojpuri)\)?/gi, '')
    .replace(/\s+lyrics(\s+english\s+meaning|\s+translation)?\s*$/i, '')
    .replace(/\s*lyrics\s*$/i, ''));
  const tail = parts.slice(1).join(' | ');
  let album = null;
  let artists = [];
  const segs = tail.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  if (segs.length >= 2) {
    if (segs.length >= 3 && segs[0].toLowerCase() === segs[segs.length - 1].toLowerCase()) {
      artists = [segs[0]];
      album = segs.slice(1, -1).join(' | ') || null;
    } else {
      album = segs[0];
      artists = segs.slice(1);
    }
  } else if (segs.length === 1) {
    artists = segs;
  }
  return { title: songTitle || cleanText(head), artists, album, language };
}

function songUrlFromInput(urlOrId) {
  const s = String(urlOrId || '').trim();
  if (/^https?:\/\//i.test(s)) return s;
  return APEX + '/' + s.replace(/^\/+/, '');
}

async function lookup(urlOrId, opts = {}) {
  const url = songUrlFromInput(urlOrId);
  const r = await fetchText(url);
  if (!r.ok) return null;
  const html = r.text;
  const og = openGraph(html);
  const node = jsonLdMusicNode(html);
  const fromTitle = parseLookupTitle(pageTitle(html));
  let artists = node && node.byArtist ? namesOf(node.byArtist) : [];
  if (!artists.length) artists = fromTitle.artists;
  const album = (node && namesOf(node.inAlbum)[0]) || fromTitle.album;
  const writers = node && node.recordingOf ? namesOf(node.recordingOf.lyricist) : [];
  const producers = node && node.recordingOf ? namesOf(node.recordingOf.composer) : [];
  const desc = cleanText(og['og:description'] || metaContent(html, 'description'));
  const title = (node && node.name ? cleanText(node.name) : fromTitle.title) || fromTitle.title;
  const res = {
    title, artist: artists[0] || '', artists,
    album: album || null, durationMs: null,
    releaseDate: metaContent(html, 'article:published_time')
      ? String(metaContent(html, 'article:published_time')).slice(0, 10) : null,
    year: null, isrc: null, genre: null, language: null,
    cover: (node && node.image) || og['og:image'] || null,
    label: null, writers, producers,
    url: og['og:url'] || url, sourceId: url, source: META.id,
    lyricsUrl: og['og:url'] || url, lyricsAvailable: true, licenseStatus: 'link-only',
    extra: fromTitle.language ? { language: fromTitle.language } : {},
  };
  if (res.releaseDate) res.year = parseInt(res.releaseDate.slice(0, 4), 10) || null;
  const snippet = desc.slice(0, 160);
  if (snippet) res.snippet = snippet;
  return res;
}

async function health() {
  const started = Date.now();
  const r = await fetchText(APEX + '/?s=p', { retries: 1 });
  const latencyMs = Date.now() - started;
  if (r.ok) return { status: 'healthy', latencyMs, note: '?s= search reachable' };
  if (r.error === 'timeout') return { status: 'error', latencyMs, note: 'timeout' };
  return { status: 'error', latencyMs, note: 'http_' + r.status };
}

module.exports = { META, search, lookup, health };
