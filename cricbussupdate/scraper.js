const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

const SOURCES = [
  { name: 'Cricbuzz home', url: 'https://www.cricbuzz.com/' },
  { name: 'Cricbuzz latest news', url: 'https://www.cricbuzz.com/cricket-news' },
];

const USER_AGENT = 'ABIX-AE Cricbuzz Update Prototype/1.0 (+https://www.cricbuzz.com/)';
const COOKIE_HEADER = process.env.CRICBUZZ_COOKIE || '';
const API_URLS = {
  home: 'https://www.cricbuzz.com/',
  news: 'https://www.cricbuzz.com/cricket-news',
  live: 'https://www.cricbuzz.com/cricket-match/live-scores',
  videos: 'https://www.cricbuzz.com/cricket-videos',
  images: 'https://www.cricbuzz.com/cricket-photo-gallery',
};

function absoluteUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://www.cricbuzz.com/');
    if (url.hostname !== 'www.cricbuzz.com' && url.hostname !== 'cricbuzz.com') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function itemId(url, title) {
  return crypto.createHash('sha256').update(`${url}\n${title}`).digest('hex').slice(0, 24);
}

function extractItems(html, source) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('a[href]').each((_, element) => {
    const link = absoluteUrl($(element).attr('href'));
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    if (!link || title.length < 18 || title.length > 240) return;
    if (!/(cricket-news|news|article|match|series|ipl|world-cup)/i.test(link)) return;
    if (seen.has(link)) return;
    seen.add(link);
    items.push({
      id: itemId(link, title),
      title,
      url: link,
      source,
      fetchedAt: new Date().toISOString(),
    });
  });

  return items.slice(0, 30);
}

async function fetchSource(source) {
  const response = await axios.get(source.url, {
    timeout: 20000,
    maxContentLength: 5 * 1024 * 1024,
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    validateStatus: status => status >= 200 && status < 400,
  });
  return extractItems(response.data, source.name);
}

async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: 20000,
    maxContentLength: 8 * 1024 * 1024,
    headers: {
      'User-Agent': process.env.CRICBUZZ_USER_AGENT || USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      Referer: 'https://www.cricbuzz.com/',
      ...(COOKIE_HEADER ? { Cookie: COOKIE_HEADER } : {}),
    },
    validateStatus: status => status >= 200 && status < 400,
  });
  return response.data;
}

function extractMatches(html) {
  const $ = cheerio.load(html);
  const matches = [];
  const seen = new Set();
  $('a[href]').each((_, element) => {
    const url = absoluteUrl($(element).attr('href'));
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    if (!url || !title || !/(live|scorecard|commentary|cricket-match)/i.test(url)) return;
    const match = url.match(/\/(\d+)(?:\/|$)/);
    const id = match?.[1] || itemId(url, title);
    if (seen.has(id)) return;
    seen.add(id);
    matches.push({ id, title, url, fetchedAt: new Date().toISOString() });
  });
  return matches.slice(0, 40);
}

function extractMediaList(html, type) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();
  $('a[href]').each((_, element) => {
    const url = absoluteUrl($(element).attr('href'));
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    const image = $(element).find('img').attr('src') || $(element).find('img').attr('data-src');
    if (!url || !title || !image || seen.has(url)) return;
    if (type === 'video' && !/cricket-videos\//i.test(url)) return;
    if (type === 'image' && !/cricket-gallery\//i.test(url)) return;
    seen.add(url);
    items.push({ id: itemId(url, title), title, url, thumbnailUrl: image, type });
  });
  return items.slice(0, 20);
}

async function fetchMedia(type) {
  const url = type === 'video' ? API_URLS.videos : API_URLS.images;
  try {
    return extractMediaList(await fetchPage(url), type);
  } catch (error) {
    if (error.response?.status !== 403) throw error;
    return extractMediaList(await fetchPage(API_URLS.home), type);
  }
}

async function fetchMediaDetail(item) {
  const html = await fetchPage(item.url);
  const $ = cheerio.load(html);
  const video = $('video source[src], video[src], meta[property="og:video"], meta[name="twitter:player:stream"]')
    .map((_, element) => $(element).attr('src') || $(element).attr('content')).get()
    .find(value => /^https?:\/\//i.test(value || ''));
  const image = $('meta[property="og:image"], meta[name="twitter:image"], img')
    .map((_, element) => $(element).attr('content') || $(element).attr('src') || $(element).attr('data-src')).get()
    .find(value => /^https?:\/\//i.test(value || '')) || item.thumbnailUrl;
  return { ...item, videoUrl: video, imageUrl: image };
}

async function fetchLatest() {
  const html = await fetchPage(API_URLS.news);
  return extractItems(html, 'news');
}

async function fetchLive() {
  const html = await fetchPage(API_URLS.live);
  return extractMatches(html);
}

async function fetchCommentary(matchIdOrUrl) {
  const value = String(matchIdOrUrl || '').trim();
  const url = /^https?:\/\//i.test(value)
    ? value
    : `https://www.cricbuzz.com/live-cricket-scores/${encodeURIComponent(value)}/match`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const lines = [];
  $('.cb-col.cb-col-8.cb-scrd-itms, .cb-col.cb-col-100.cb-com-ln, .cb-col.cb-col-67.cb-scrd-lft').each((_, element) => {
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    if (text && !lines.includes(text)) lines.push(text);
  });
  return { url, lines: lines.slice(0, 30), matches: extractMatches(html) };
}

async function scrape() {
  const results = [];
  const failures = [];
  for (const source of SOURCES) {
    try {
      results.push(...await fetchSource(source));
    } catch (error) {
      failures.push({ source: source.name, error: error.message });
    }
  }

  const unique = new Map();
  for (const item of results) {
    if (!unique.has(item.id)) unique.set(item.id, item);
  }
  return {
    fetchedAt: new Date().toISOString(),
    items: [...unique.values()].slice(0, 50),
    failures,
  };
}

module.exports = {
  SOURCES,
  API_URLS,
  scrape,
  fetchLatest,
  fetchLive,
  fetchCommentary,
  fetchMedia,
  fetchMediaDetail,
  extractMediaList,
};
