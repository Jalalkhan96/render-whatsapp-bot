/**
 * YouTube adapter (id 75) — entertainment / INT
 * Transport: http (public search-page HTML parse) + RSS (channel feeds) + oEmbed.
 * No private API keys used.
 * Verified 2026-10-05 from datacenter IP with browser UA:
 *   - /results?search_query=... -> HTTP 200, ytInitialData with videoRenderer items (real titles/ids)
 *   - /feeds/videos.xml?channel_id=... -> HTTP 200, valid Atom RSS
 *   - /oembed?url=<watch url>&format=json -> HTTP 200, real metadata
 *   - /feed/trending -> HTTP 200 but skeleton page with no videoIds (JS-rendered);
 *     latest() therefore uses search-page results (broad default query) or
 *     channel RSS when opts.channelIds is supplied.
 */
'use strict';

const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DEFAULT_QUERY = 'news';

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: ctrl.signal, redirect: 'follow' });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url) {
  const { status, body } = await fetchText(url);
  if (status !== 200) throw new Error(`YouTube HTTP ${status} for ${url}`);
  return JSON.parse(body);
}

/** Recursively collect videoRenderer objects from ytInitialData. */
function collectVideoRenderers(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => collectVideoRenderers(n, out)); return; }
  if (node.videoRenderer && node.videoRenderer.videoId) { out.push(node.videoRenderer); return; }
  for (const k of Object.keys(node)) collectVideoRenderers(node[k], out);
}

function textOf(runs) {
  if (!runs) return null;
  if (typeof runs === 'string') return runs;
  if (runs.simpleText) return runs.simpleText;
  if (Array.isArray(runs.runs)) return runs.runs.map((r) => r.text || '').join('');
  return null;
}

function fromRenderer(vr) {
  const id = vr.videoId;
  const title = textOf(vr.title);
  return {
    videoId: id,
    title,
    channel: textOf(vr.ownerText) || textOf(vr.longBylineText),
    channelId: vr.ownerText && vr.ownerText.runs && vr.ownerText.runs[0] && vr.ownerText.runs[0].navigationEndpoint
      ? (vr.ownerText.runs[0].navigationEndpoint.browseEndpoint || {}).browseId || null
      : null,
    duration: textOf(vr.lengthText),
    views: textOf(vr.viewCountText),
    publishedRelative: textOf(vr.publishedTimeText),
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: (vr.thumbnail && vr.thumbnail.thumbnails && vr.thumbnail.thumbnails.slice(-1)[0] || {}).url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

async function searchPage(query, maxResults) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
  const { status, body } = await fetchText(url);
  if (status !== 200) throw new Error(`YouTube search HTTP ${status}`);
  const m = body.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error('YouTube: ytInitialData not found in search page');
  const data = JSON.parse(m[1]);
  const renderers = [];
  collectVideoRenderers(data, renderers);
  const seen = new Set();
  const items = [];
  for (const vr of renderers) {
    if (seen.has(vr.videoId)) continue;
    seen.add(vr.videoId);
    items.push(fromRenderer(vr));
    if (items.length >= maxResults) break;
  }
  return items;
}

async function channelRss(channelId, maxResults) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const { status, body } = await fetchText(url);
  if (status !== 200) throw new Error(`YouTube RSS HTTP ${status} for channel ${channelId}`);
  const $ = cheerio.load(body, { xmlMode: true });
  const items = [];
  $('entry').each((_, el) => {
    if (items.length >= maxResults) return false;
    const $e = $(el);
    const videoId = $e.find('yt\\:videoId').text() || null;
    items.push({
      videoId,
      title: $e.find('title').first().text() || null,
      channel: $e.find('author > name').text() || null,
      channelId,
      duration: null,
      views: null,
      publishedRelative: null,
      publishedAt: $e.find('published').first().text() || null,
      url: $e.find('link[rel="alternate"]').attr('href') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null),
      thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
    });
  });
  return items;
}

function normalize(raw) {
  return {
    source: 'youtube',
    sourceUrl: raw.url || null,
    category: 'entertainment',
    title: raw.title || null,
    description: [raw.channel, raw.views, raw.publishedRelative, raw.duration].filter(Boolean).join(' · ') || null,
    content: null,
    url: raw.url || null,
    image: raw.thumbnail || null,
    author: raw.channel || null,
    publishedAt: raw.publishedAt || null,
    updatedAt: null,
    country: 'INT',
    language: 'en',
    tags: [],
    metadata: {
      score: null,
      comments: null,
      engagement: null,
      videoId: raw.videoId || null,
      channelId: raw.channelId || null,
      duration: raw.duration || null,
      views: raw.views || null,
      publishedRelative: raw.publishedRelative || null,
    },
    scrapedAt: new Date().toISOString(),
  };
}

const adapter = {
  id: 'youtube',
  name: 'YouTube',
  country: 'INT',
  category: 'entertainment',
  baseUrl: 'https://www.youtube.com/',
  language: 'en',
  enabled: true,
  priority: 75,
  transport: 'http',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1500 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    searchHtml: 'https://www.youtube.com/results?search_query={query}&hl=en',
    channelRss: 'https://www.youtube.com/feeds/videos.xml?channel_id={channelId}',
    oembed: 'https://www.youtube.com/oembed?url={watchUrl}&format=json',
    defaultLatestQuery: DEFAULT_QUERY,
  },
  selectors: {
    initialDataScript: 'var ytInitialData = {...}; in page <script>',
    videoRenderer: 'videoRenderer objects inside ytInitialData (videoId, title, ownerText, viewCountText, publishedTimeText)',
  },
  schedule: { frequency: 'medium' },

  async latest(opts = {}) {
    const max = Math.min(opts.limit || opts.maxResults || 30, 30);
    let raw;
    if (opts.channelIds && opts.channelIds.length > 0) {
      const per = Math.max(1, Math.ceil(max / opts.channelIds.length));
      const lists = await Promise.all(opts.channelIds.slice(0, 5).map((id) => channelRss(id, per)));
      raw = lists.flat();
    } else {
      raw = await searchPage(opts.query || DEFAULT_QUERY, max);
    }
    return raw.slice(0, max).map(normalize);
  },

  async search(query, opts = {}) {
    if (!query || !String(query).trim()) throw new Error('YouTube search: query is required');
    const max = Math.min(opts.limit || opts.maxResults || 30, 30);
    return (await searchPage(String(query).trim(), max)).map(normalize);
  },

  async scrape(url, opts = {}) {
    if (!url || !/youtube\.com\/watch|youtu\.be\//.test(url)) throw new Error('YouTube scrape: a video watch URL is required');
    const meta = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    const idMatch = url.match(/[?&]v=([\w-]{11})|\/([\w-]{11})(?:[?#]|$)/);
    const videoId = idMatch ? (idMatch[1] || idMatch[2]) : null;
    return normalize({
      videoId,
      title: meta.title || null,
      channel: meta.author_name || null,
      channelId: null,
      duration: null,
      views: null,
      publishedRelative: null,
      publishedAt: null,
      url,
      thumbnail: meta.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null),
    });
  },

  normalize,
  _fetchText: fetchText,
  _searchPage: searchPage,
  _channelRss: channelRss,
};

module.exports = adapter;
