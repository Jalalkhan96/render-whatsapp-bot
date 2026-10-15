'use strict';
// Gratisography adapter — quirky free stock photos. License honesty: Gratisography
// free license allows commercial use without attribution; site license, not CC0.
// Selectors below are documented per site.
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');
const SITE = 'https://gratisography.com';

// Per-site selectors: search results link out to individual photo detail pages;
// cards are captured as <a> elements (root-relative href, not nav) wrapping an
// <img>. JSON-LD ImageObjects tried first.
function cardAnchors(html, limit) {
  const out = [];
  const re = /<a[^>]*href="(\/[^"]{3,})"[^>]*>([\s\S]*?)<\/a>/gi;
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
  id: 'gratisography',
  name: 'Gratisography',
  website: 'https://gratisography.com/',
  type: 'photo',
  transport: 'page',
  docsUrl: 'https://gratisography.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 31,
  tags: ['stock-photo', 'free-stock', 'quirky'],
  categories: ['photo', 'free-stock'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: {
    license: 'Gratisography Free License',
    licenseUrl: 'https://gratisography.com/',
    licenseType: 'site-license',
    attributionRequired: false,
    commercialUse: true,
    modificationAllowed: true,
    notes: 'Gratisography free license: free use incl. commercial, no attribution required. Site-specific license — not CC0 / public domain.',
  },
  async search(query, options, ctx) {
    const limit = Math.min((options && options.limit) || 20, 50);
    const url = SITE + '/?s=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    let raws = cardAnchors(html, limit);
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
      license: 'Gratisography Free License',
      licenseUrl: 'https://gratisography.com/',
      licenseType: 'site-license',
      attributionRequired: false,
      commercialUse: true,
      modificationAllowed: true,
    };
  },
};
