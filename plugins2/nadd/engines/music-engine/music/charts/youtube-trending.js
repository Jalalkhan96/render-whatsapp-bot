'use strict';
/**
 * YouTube Trending (most popular music) adapter via the documented YouTube
 * Data API v3 videos.list endpoint with chart=mostPopular. Requires
 * YOUTUBE_API_KEY; without it the adapter returns 'auth_required'.
 * Endpoint: https://www.googleapis.com/youtube/v3/videos
 */
const { fetchJson } = require('../http');
const { cleanText } = require('../html');

const META = { id:'youtube-trending', name:'YouTube Trending', type:'charts', country:'US',
  languages:['en'], searchSupported:true, directLookupSupported:false,
  apiSupported:true, scrapingSupported:false, priority:4,
  needsKey:'YOUTUBE_API_KEY',
  baseUrl:'https://www.youtube.com', enabled:true };

const API_URL = 'https://www.googleapis.com/youtube/v3/videos';

function parseEntries(data, country, limit) {
  const items = (data && Array.isArray(data.items)) ? data.items : [];
  const entries = [];
  for (let i = 0; i < items.length && entries.length < limit; i++) {
    const it = items[i] || {};
    const sn = it.snippet || {};
    const vid = typeof it.id === 'string' ? it.id : (it.id && it.id.videoId) || '';
    const title = cleanText(sn.title);
    if (!title) continue;
    entries.push({
      rank: i + 1,
      prevRank: null,
      peak: null,
      weeks: null,
      title,
      artist: cleanText(sn.channelTitle) || null,
      country,
      chart: 'YouTube Trending',
      date: sn.publishedAt ? String(sn.publishedAt).slice(0, 10) : null,
      url: vid ? 'https://www.youtube.com/watch?v=' + vid : 'https://www.youtube.com/feed/trending',
    });
  }
  return entries;
}

async function charts(country, opts = {}) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return { status:'auth_required', entries:[], note:'Set YOUTUBE_API_KEY to use YouTube Trending' };
  }
  const cc = String(country || 'US').toUpperCase();
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 20, 50));
  const url = API_URL + '?part=snippet,statistics&chart=mostPopular&regionCode=' +
    encodeURIComponent(cc) + '&maxResults=' + limit + '&key=' + encodeURIComponent(key);
  const r = await fetchJson(url, { retries: 1 });
  if (!r.ok) {
    const msg = r.data && r.data.error && r.data.error.message ? String(r.data.error.message) : ('HTTP ' + r.status);
    const auth = r.status === 400 || r.status === 401 || r.status === 403;
    return { status: auth ? 'auth_required' : 'unreachable', entries:[],
      note:'YouTube API error: ' + msg };
  }
  const entries = parseEntries(r.data, cc, limit);
  return { status:'ok', entries, note:'YouTube mostPopular (' + cc + ')' };
}

async function search(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { status:'ok', results:[], note:'Empty query' };
  const c = await charts(opts.country || 'US', { limit: 50 });
  if (c.status !== 'ok') return { status:c.status, results:[], note:c.note };
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 10, 50));
  const results = c.entries.filter(e =>
    ((e.title || '') + ' ' + (e.artist || '')).toLowerCase().includes(q)).slice(0, limit);
  return { status:'ok', results, note: results.length + ' match(es) for "' + query + '" in YouTube Trending' };
}

async function lookup() { return null; }

async function health() {
  if (!process.env.YOUTUBE_API_KEY) {
    return { status:'auth_required', latencyMs:0, note:'Set YOUTUBE_API_KEY to enable' };
  }
  const t0 = Date.now();
  const r = await fetchJson(API_URL + '?part=snippet&chart=mostPopular&regionCode=US&maxResults=1&key=' +
    encodeURIComponent(process.env.YOUTUBE_API_KEY), { retries: 0 });
  if (!r.ok) {
    const msg = r.data && r.data.error && r.data.error.message ? String(r.data.error.message) : ('HTTP ' + r.status);
    return { status:'unreachable', latencyMs: Date.now() - t0, note: msg };
  }
  return { status:'ok', latencyMs: r.ms, note:'YouTube Data API reachable' };
}

module.exports = { META, search, lookup, health, charts };
