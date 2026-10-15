const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

const USER_AGENT = 'ABIX-AE Pinterest Scraper Prototype/1.0';
const COOKIE_FILE = process.env.PINTEREST_COOKIES_JSON || '';

function absoluteUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://www.pinterest.com/');
    if (!['www.pinterest.com', 'pinterest.com'].includes(url.hostname)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function idFor(url, title) {
  return crypto.createHash('sha256').update(`${url}\n${title}`).digest('hex').slice(0, 24);
}

function addPin(items, seen, pin) {
  if (!pin.url || seen.has(pin.url)) return;
  seen.add(pin.url);
  items.push({ id: idFor(pin.url, pin.title), ...pin });
}

function loadCookieHeader() {
  if (!COOKIE_FILE) return '';
  try {
    const parsed = require(COOKIE_FILE);
    if (!Array.isArray(parsed)) return '';
    return parsed
      .filter(item => item && item.name && item.value)
      .map(item => `${item.name}=${item.value}`)
      .join('; ');
  } catch {
    return '';
  }
}

function extractPins(html) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('a[href*="/pin/"]').each((_, element) => {
    const url = absoluteUrl($(element).attr('href'));
    const image = $(element).find('img').attr('src') || $(element).find('img').attr('data-src');
    const title = ($(element).attr('aria-label') || $(element).text() || '').replace(/\s+/g, ' ').trim();
    if (url) addPin(items, seen, { url, title: title || 'Pinterest pin', imageUrl: image || null });
  });

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const value = JSON.parse($(element).html());
      const records = Array.isArray(value) ? value : [value];
      for (const record of records) {
        const url = absoluteUrl(record?.url || record?.mainEntityOfPage);
        const image = typeof record?.image === 'string' ? record.image : record?.image?.url;
        if (url && url.includes('/pin/')) {
          addPin(items, seen, { url, title: record.name || record.description || 'Pinterest pin', imageUrl: image || null });
        }
      }
    } catch {
      // Pinterest may embed partial JSON during progressive rendering.
    }
  });

  return items.slice(0, 50);
}

function extractIdeas(html) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();
  $('a[href*="/ideas/"]').each((_, element) => {
    const url = absoluteUrl($(element).attr('href'));
    const title = ($(element).text() || $(element).attr('aria-label') || '').replace(/\s+/g, ' ').trim();
    const image = $(element).find('img').attr('src') || $(element).find('img').attr('data-src') || null;
    if (!url || !title) return;
    addPin(items, seen, { url, title, imageUrl: image });
  });
  return items.slice(0, 50);
}

async function fetchPage(url) {
  const cookie = loadCookieHeader();
  const response = await axios.get(url, {
    timeout: 20000,
    maxContentLength: 8 * 1024 * 1024,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    validateStatus: status => status >= 200 && status < 400,
  });
  return response.data;
}

async function scrape(query = '') {
  const searchUrl = query
    ? `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`
    : 'https://www.pinterest.com/ideas/';
  const html = await fetchPage(searchUrl);
  let items = extractPins(html);
  let source = searchUrl;
  if (!items.length) {
    const ideasUrl = 'https://www.pinterest.com/ideas/';
    const ideasHtml = await fetchPage(ideasUrl);
    items = extractIdeas(ideasHtml);
    source = ideasUrl;
  }
  return {
    fetchedAt: new Date().toISOString(),
    query,
    url: source,
    items,
  };
}

module.exports = { scrape, extractPins };
