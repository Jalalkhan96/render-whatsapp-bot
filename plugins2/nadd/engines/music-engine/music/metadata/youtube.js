'use strict';
/**
 * YouTube metadata adapter (NO KEY needed for lookup).
 *
 * VERIFIED LIVE (2026-10-05):
 *  - oEmbed: https://www.youtube.com/oembed?url=<watch-url>&format=json
 *    returns 200 JSON with title, author_name, author_url, thumbnail_url
 *    (verified on the official "Blinding Lights" video 4NRXx6U8ABQ).
 *  - Watch page HTML (200, ~1.3MB) carries JSON-LD VideoObject (name,
 *    uploadDate, thumbnailUrl), og:title/og:description/og:image and
 *    "lengthSeconds":"263" for duration. Nothing is downloaded.
 *  - Data API v3 search is implemented ONLY when YOUTUBE_API_KEY is set;
 *    without a key search() returns auth_required (per spec). The
 *    www.googleapis.com endpoint could not be reached from this VM, so the
 *    keyed path follows the official API contract but is unverified live.
 */
const { fetchText, fetchJson } = require('../http');
const { cleanText, decodeEntities, metaContent, jsonLdMusicNode, durationToMs } = require('../html');

const META = {
  id: 'youtube', name: 'YouTube', type: 'metadata', country: 'US',
  languages: ['en'], searchSupported: true, directLookupSupported: true,
  apiSupported: true, scrapingSupported: true, priority: 3,
  needsKey: 'YOUTUBE_API_KEY (for search)',
  baseUrl: 'https://www.youtube.com', enabled: true,
};

const PROBE_VIDEO_ID = '4NRXx6U8ABQ'; // official "The Weeknd - Blinding Lights" video, used only as a probe

function apiKey() { return process.env.YOUTUBE_API_KEY || null; }

function extractVideoId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = p.exec(s);
    if (m) return m[1];
  }
  return null;
}

function channelType(authorName) {
  const a = String(authorName || '');
  if (/VEVO$/i.test(a) || /\bofficial\b/i.test(a)) return 'official_artist_channel';
  if (/ - Topic$/i.test(a)) return 'auto_generated_topic';
  return 'standard_channel';
}

async function search(query, opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 8, 1), 25);
  if (!query || !String(query).trim()) return { status: 'error', results: [], note: 'empty query' };
  const key = apiKey();
  if (!key) {
    return { status: 'auth_required', results: [], note: 'Set YOUTUBE_API_KEY for search' };
  }
  const qs = new URLSearchParams({
    part: 'snippet', q: String(query).trim(), type: 'video',
    maxResults: String(limit), key,
  });
  const r = await fetchJson('https://www.googleapis.com/youtube/v3/search?' + qs.toString());
  if (!r.ok) {
    if (r.status === 400 || r.status === 403) return { status: 'auth_required', results: [], note: 'YouTube Data API rejected the request (bad/expired key or quota)' };
    if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', results: [], note: 'YouTube Data API timed out' };
    return { status: 'error', results: [], note: 'YouTube Data API ' + (r.error || r.status) };
  }
  const items = Array.isArray(r.data.items) ? r.data.items : [];
  const results = items.map((it) => {
    const vid = it.id && it.id.videoId;
    const sn = it.snippet || {};
    const thumbs = sn.thumbnails || {};
    if (!vid) return null;
    return {
      title: cleanText(sn.title || ''), artist: cleanText(sn.channelTitle || ''),
      artists: sn.channelTitle ? [cleanText(sn.channelTitle)] : [],
      album: null, durationMs: null,
      releaseDate: sn.publishedAt || null,
      year: sn.publishedAt ? parseInt(sn.publishedAt.slice(0, 4), 10) || null : null,
      isrc: null, genre: null, language: sn.defaultLanguage || sn.defaultAudioLanguage || null,
      cover: (thumbs.high || thumbs.medium || thumbs.default || {}).url || null,
      label: null, writers: [], producers: [],
      url: 'https://www.youtube.com/watch?v=' + vid, sourceId: vid, source: 'youtube',
      extra: { channelId: sn.channelId || null, channelType: channelType(sn.channelTitle), description: cleanText((sn.description || '').slice(0, 300)) },
    };
  }).filter(Boolean);
  return { status: 'ok', results, note: 'via YouTube Data API v3' };
}

async function lookup(urlOrId, opts = {}) {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) return null;
  const watchUrl = 'https://www.youtube.com/watch?v=' + videoId;

  // 1) oEmbed — official, tiny, keyless (verified live).
  const oe = await fetchJson(META.baseUrl + '/oembed?url=' + encodeURIComponent(watchUrl) + '&format=json');
  const oembed = oe.ok && oe.data ? oe.data : null;

  // 2) Watch page — JSON-LD / OG / lengthSeconds (verified live).
  const wp = await fetchText(watchUrl);
  const html = wp.ok ? wp.text : '';
  const ogTitle = html ? metaContent(html, 'og:title') : '';
  const ogDesc = html ? metaContent(html, 'og:description') : '';
  const ogImage = html ? metaContent(html, 'og:image') : '';
  const node = html ? jsonLdMusicNode(html) : null;
  const videoNode = node && /VideoObject/i.test(String(node['@type'])) ? node : null;
  const lenM = html ? /"lengthSeconds":"(\d+)"/.exec(html) : null;
  const upM = html ? /"uploadDate":"([^"]+)"/.exec(html) : null;
  const chanM = html ? /"ownerChannelName":"([^"]+)"/.exec(html) : null;

  const title = cleanText((oembed && oembed.title) || ogTitle || '');
  if (!title && !wp.ok) return null;
  const author = cleanText(decodeEntities((oembed && oembed.author_name) || (chanM && chanM[1]) || ''));
  const uploadDate = (videoNode && videoNode.uploadDate) || (upM && upM[1]) || null;
  return {
    title, artist: author, artists: author ? [author] : [],
    album: null,
    durationMs: lenM ? parseInt(lenM[1], 10) * 1000 : null,
    releaseDate: uploadDate,
    year: uploadDate ? parseInt(String(uploadDate).slice(0, 4), 10) || null : null,
    isrc: null, genre: null, language: null,
    cover: (oembed && oembed.thumbnail_url) || ogImage || null,
    label: null, writers: [], producers: [],
    url: watchUrl, sourceId: videoId, source: 'youtube',
    extra: {
      channelName: author || null,
      channelUrl: (oembed && oembed.author_url) || null,
      channelType: channelType(author),
      description: cleanText(ogDesc).slice(0, 300) || null,
    },
  };
}

async function health() {
  const started = Date.now();
  const r = await fetchJson(META.baseUrl + '/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + PROBE_VIDEO_ID) + '&format=json');
  const ms = Date.now() - started;
  if (r.ok && r.data && r.data.title) return { status: 'healthy', latencyMs: ms, note: 'oEmbed endpoint reachable' };
  if (r.status === 401 || r.status === 403) return { status: 'blocked', latencyMs: ms, note: 'YouTube oEmbed HTTP ' + r.status };
  if (r.error === 'timeout' || r.status === 0) return { status: 'timeout', latencyMs: ms, note: 'YouTube unreachable' };
  return { status: 'error', latencyMs: ms, note: 'YouTube oEmbed ' + (r.error || r.status) };
}

module.exports = { META, search, lookup, health, extractVideoId };
