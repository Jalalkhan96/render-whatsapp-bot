'use strict';
// StockSnap adapter — CC0 stock photos (see https://stocksnap.io/license). License
// honesty: CC0 is a public-domain dedication, not a generic 'free' license; the
// file-level rights are CC0 per the site, with no attribution requirement.
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');
const SITE = 'https://stocksnap.io';

// Per-site selectors: search-result cards are <a href="/photo/<slug>-<id>"> elements
// wrapping an <img> (src + alt). JSON-LD ImageObjects are tried first.
function jsonLdImages(html, limit) {
  const out = [];
  for (const n of extractJsonLd(html)) {
    const list = (n['@type'] === 'ItemList' && Array.isArray(n.itemListElement))
      ? n.itemListElement.map(e => e.item || e) : [n];
    for (const it of list) {
      if (out.length >= limit) break;
      if (!it || (it['@type'] !== 'ImageObject' && it['@type'] !== 'Photograph')) continue;
      out.push({
        sourceId: absolutizeUrl(it.url || it.contentUrl, SITE),
        imageUrl: absolutizeUrl(it.contentUrl || it.url, SITE),
        sourceUrl: absolutizeUrl(it.mainEntityOfPage || it.url || it.contentUrl, SITE),
        title: cleanText(it.name || it.headline),
        creator: cleanText((it.creator && it.creator.name) || it.author),
      });
    }
  }
  return out;
}

function cardAnchors(html, limit) {
  const out = [];
  const re = /<a[^>]*href="([^"]*\/photo\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const img = /<img[^>]*>/i.exec(m[2]);
    if (!img) continue;
    const src = /(?:src|data-src)\s*=\s*"([^"]+)"/i.exec(img[0]);
    const alt = /alt\s*=\s*"([^"]*)"/i.exec(img[0]);
    out.push({
      sourceId: absolutizeUrl(m[1], SITE),
      imageUrl: absolutizeUrl(src && src[1], SITE),
      thumbnailUrl: absolutizeUrl(src && src[1], SITE),
      sourceUrl: absolutizeUrl(m[1], SITE),
      title: cleanText(alt && alt[1]),
    });
  }
  return out;
}

module.exports = {
  id: 'stocksnap',
  name: 'StockSnap',
  website: 'https://stocksnap.io/',
  type: 'photo',
  transport: 'page',
  docsUrl: 'https://stocksnap.io/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 6,
  tags: ['stock-photo', 'free-stock', 'cc0'],
  categories: ['photo', 'free-stock'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: {
    license: 'CC0 1.0 Universal',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    licenseType: 'cc0',
    attributionRequired: false,
    commercialUse: true,
    modificationAllowed: true,
    notes: 'StockSnap publishes its photos under CC0 (https://stocksnap.io/license) — a public-domain dedication, not a custom "free" license.',
  },
  async search(query, options, ctx) {
    const limit = Math.min((options && options.limit) || 20, 50);
    const url = SITE + '/search/' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    let raws = jsonLdImages(html, limit);
    if (!raws.length) raws = cardAnchors(html, limit);
    if (!raws.length) raws = extractImages(html, url, limit).map(im => ({
      sourceId: im.src, imageUrl: im.src, thumbnailUrl: im.src, sourceUrl: url, title: cleanText(im.alt),
    }));
    return raws;
  },
  mapResult(raw) {
    return {
      sourceId: raw.sourceId,
      imageUrl: raw.imageUrl,
      thumbnailUrl: raw.thumbnailUrl,
      sourceUrl: raw.sourceUrl,
      title: raw.title || '',
      creator: raw.creator || '',
      license: 'CC0 1.0 Universal',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      licenseType: 'cc0',
      attributionRequired: false,
      commercialUse: true,
      modificationAllowed: true,
    };
  },
};
