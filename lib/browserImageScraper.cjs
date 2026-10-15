'use strict';

let playwright = null;
try {
  playwright = require('playwright');
} catch (_) {
  // Loaded lazily so existing bot installs can continue to use the Axios sources
  // even when Playwright is not installed. A clear error is raised only when a
  // browser-based source is requested.
}

const STOCK_SOURCES = {
  unsplash: {
    name: 'Unsplash',
    base: 'https://unsplash.com',
    search: q => `https://unsplash.com/s/photos/${encodeURIComponent(q.trim()).replace(/%20/g, '-')}`,
    allowed: url => /(^|\.)images\.unsplash\.com\//i.test(url),
  },
  pexels: {
    name: 'Pexels',
    base: 'https://www.pexels.com',
    search: q => `https://www.pexels.com/search/${encodeURIComponent(q.trim()).replace(/%20/g, '%20')}/`,
    allowed: url => /(^|\.)images\.pexels\.com\//i.test(url),
  },
  pixabay: {
    name: 'Pixabay',
    base: 'https://pixabay.com',
    search: q => `https://pixabay.com/images/search/${encodeURIComponent(q.trim()).replace(/%20/g, '%20')}/`,
    allowed: url => /(^|\.)cdn\.pixabay\.com\//i.test(url) || /(^|\.)pixabay\.com\/(?:get|images)\//i.test(url),
  },
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

function requirePlaywright() {
  if (!playwright?.chromium) {
    throw new Error('Playwright is required for Unsplash/Pexels/Pixabay scraping. Install with: npm i playwright && npx playwright install chromium');
  }
  return playwright.chromium;
}

function cleanUrl(raw, pageUrl) {
  if (!raw) return null;
  let value = String(raw).trim();
  if (value.startsWith('//')) value = `https:${value}`;
  if (value.startsWith('data:') || value.startsWith('blob:')) return null;
  try {
    const out = new URL(value, pageUrl).href;
    return /^https?:\/\//i.test(out) ? out : null;
  } catch (_) {
    return null;
  }
}

function parseSrcset(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => x.split(/\s+/)[0])
    .filter(Boolean);
}

function uniq(items, max = 25) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = item.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

async function collectPageImages(page, cfg, pageUrl, limit) {
  const candidates = await page.$$eval('img', imgs => imgs.map(img => ({
    src: img.currentSrc || img.src || img.getAttribute('src') || '',
    srcset: img.getAttribute('srcset') || img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset') || '',
    dataSrc: img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || '',
    alt: img.getAttribute('alt') || '',
  })));

  const rows = [];
  for (const item of candidates) {
    const sources = [
      ...parseSrcset(item.srcset),
      item.dataSrc,
      item.src,
    ].filter(Boolean);

    // Prefer the last srcset candidate: it is normally the largest width.
    for (const raw of sources.reverse()) {
      const url = cleanUrl(raw, pageUrl);
      if (!url || !cfg.allowed(url)) continue;
      rows.push({ url, alt: item.alt || '', thumbnail: cleanUrl(item.src, pageUrl), sourcePage: pageUrl });
      break;
    }
  }
  return uniq(rows, limit);
}

async function browserSearch(source, query, { limit = 10, scrolls = 4, scrollDelay = 1200 } = {}) {
  const cfg = STOCK_SOURCES[source];
  if (!cfg) throw new Error(`Unknown browser source: ${source}`);
  const chromium = requirePlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const pageUrl = cfg.search(query);

  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);

    for (let i = 0; i < Math.max(1, scrolls); i++) {
      await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight * 1.8, 1200)));
      await page.waitForTimeout(scrollDelay);
    }

    // One final pass can force lazy images near the current viewport to resolve.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);

    const images = await collectPageImages(page, cfg, page.url(), Math.min(30, Math.max(1, limit)));
    const title = await page.title().catch(() => '');
    return {
      source,
      sourceName: cfg.name,
      query,
      pageUrl: page.url(),
      title: title || cfg.name,
      images,
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function getStockSources() {
  return Object.entries(STOCK_SOURCES).map(([id, v]) => ({ id, name: v.name, base: v.base }));
}

module.exports = { STOCK_SOURCES, getStockSources, browserSearch };
