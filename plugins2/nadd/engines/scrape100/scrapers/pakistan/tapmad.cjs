// Tapmad — public schedules/listings scraper
// Verified live 2026-10-05: the homepage embeds __NEXT_DATA__ JSON with
// pageProps.movies.Sections[] -> Videos[] (ContentVideoName/SeoTitle,
// ContentDescription, NewChannelThumbnailPath, ContentEntityId, IsVideoFree, IsSports...).
// Only public listing metadata is collected — never bypasses paid access.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.tapmad.com';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { headers = {}, timeoutMs = 25000, attempts = 3 } = {}) {
  let lastErr;
  for (let a = 0; a < attempts; a++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return await res.text();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (a < attempts - 1) await sleep(1200 * Math.pow(2, a));
    }
  }
  throw lastErr;
}

function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function dedupe(records) {
  const seen = new Set();
  return records.filter((r) => {
    const k = r.url || r.title;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function videoToRecord(v, sectionName) {
  const title = v.ContentVideoName || v.SeoTitle || v.contentHeaderName || null;
  if (!title) return null;
  const url = v.ContentEntityId ? `${BASE}/video/${v.ContentEntityId}` : BASE + '/';
  return {
    source: 'tapmad', sourceUrl: BASE + '/',
    category: 'entertainment',
    title: String(title).trim(),
    description: (v.ContentDescription || '').trim() || null,
    content: null,
    url,
    image: v.NewChannelThumbnailPath || v.ChannelTVImage || v.ContentImage || null,
    author: null,
    publishedAt: v.ContentEventStartDate || null,
    updatedAt: null,
    country: 'PK', language: 'en',
    tags: [sectionName, v.CategorySeoTitle].filter(Boolean),
    metadata: {
      section: sectionName,
      categoryName: v.CategorySeoTitle || null,
      isFree: v.IsVideoFree === true || v.IsSectionFree === 1,
      isSports: !!v.IsSports,
      entityId: v.ContentEntityId || null,
    },
    scrapedAt: new Date().toISOString(),
  };
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const html = await fetchText(BASE + '/');
  const j = nextData(html);
  const sections = j && j.props && j.props.pageProps && j.props.pageProps.movies && j.props.pageProps.movies.Sections;
  if (!sections) throw new Error('Tapmad __NEXT_DATA__ sections not found');
  const out = [];
  for (const s of sections) {
    for (const v of s.Videos || []) {
      const r = videoToRecord(v, s.SectionName || null);
      if (r) out.push(r);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  await sleep(1200);
  return dedupe(out).slice(0, limit);
}

async function search(query, opts = {}) {
  const q = String(query || '').toLowerCase();
  const recs = await latest({ ...opts, limit: 60 });
  return recs.filter((r) => ((r.title || '') + ' ' + (r.description || '') + ' ' + r.tags.join(' ')).toLowerCase().includes(q)).slice(0, opts.limit || 30);
}

async function scrape(url, opts = {}) {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  return normalize({
    source: 'tapmad', sourceUrl: BASE + '/',
    category: 'entertainment',
    title: $('meta[property="og:title"]').attr('content') || $('title').text().trim() || null,
    description: $('meta[property="og:description"]').attr('content') || null,
    url,
    image: $('meta[property="og:image"]').attr('content') || null,
    country: 'PK', language: 'en', tags: [],
    metadata: {},
  });
}

function normalize(raw) {
  return {
    source: 'tapmad',
    sourceUrl: raw.sourceUrl || BASE + '/',
    category: raw.category || 'entertainment',
    title: raw.title || null,
    description: raw.description || null,
    content: raw.content || null,
    url: raw.url || null,
    image: raw.image || null,
    author: raw.author || null,
    publishedAt: raw.publishedAt || null,
    updatedAt: raw.updatedAt || null,
    country: raw.country || 'PK',
    language: raw.language || 'en',
    tags: raw.tags || [],
    metadata: { ...(raw.metadata || {}), scrapedAt: raw.scrapedAt || new Date().toISOString() },
  };
}

module.exports = {
  id: 'tapmad',
  name: 'Tapmad',
  country: 'PK',
  category: 'entertainment',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 41,
  transport: 'json',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.tapmad.com/ (embedded __NEXT_DATA__ pageProps.movies.Sections[].Videos[])',
  },
  selectors: {
    embeddedJson: 'script#__NEXT_DATA__ (application/json)',
  },
  schedule: { frequency: 'low' },
  latest,
  search,
  scrape,
  normalize,
};
