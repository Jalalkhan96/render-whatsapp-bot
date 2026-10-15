'use strict';
// Reshot adapter — free photos, icons AND illustrations (mixed type). License
// honesty: Reshot license allows free use incl. commercial, no attribution;
// site license, not CC0. Asset kind is detected per card from the detail URL
// and surfaced in categories[] (photo|icon|illustration).
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');
const SITE = 'https://www.reshot.com';

// Per-site selectors: result cards link to /photos/<slug>, /icons/<slug> or
// /illustrations/<slug>, each wrapping an <img> (src + alt).
function cardAnchors(html, limit) {
  const out = [];
  const re = /<a[^>]*href="((?:\/photos\/|\/icons\/|\/illustrations\/)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const img = /<img[^>]*>/i.exec(m[2]);
    if (!img) continue;
    const src = /(?:src|data-src)\s*=\s*"([^"]+)"/i.exec(img[0]);
    const alt = /alt\s*=\s*"([^"]*)"/i.exec(img[0]);
    const kind = /^\/(photos|icons|illustrations)\//.exec(m[1]);
    const cat = !kind ? 'photo' : kind[1] === 'photos' ? 'photo' : kind[1] === 'icons' ? 'icon' : 'illustration';
    out.push({
      sourceId: absolutizeUrl(m[1], SITE),
      imageUrl: absolutizeUrl(src && src[1], SITE),
      thumbnailUrl: absolutizeUrl(src && src[1], SITE),
      sourceUrl: absolutizeUrl(m[1], SITE),
      title: cleanText(alt && alt[1]),
      categories: [cat],
    });
  }
  return out;
}

module.exports = {
  id: 'reshot',
  name: 'Reshot',
  website: 'https://www.reshot.com/',
  type: 'mixed',
  transport: 'page',
  docsUrl: 'https://www.reshot.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 30,
  tags: ['stock-photo', 'free-stock', 'icon', 'illustration'],
  categories: ['photo', 'icon', 'illustration'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: true, illustrations: true, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: {
    license: 'Reshot License',
    licenseUrl: 'https://www.reshot.com/',
    licenseType: 'site-license',
    attributionRequired: false,
    commercialUse: true,
    modificationAllowed: true,
    notes: 'Reshot license: free use incl. commercial, no attribution required. Site-specific license — not CC0 / public domain.',
  },
  async search(query, options, ctx) {
    const limit = Math.min((options && options.limit) || 20, 50);
    const url = SITE + '/search/' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    let raws = cardAnchors(html, limit);
    if (!raws.length) raws = extractImages(html, url, limit).map(im => ({
      sourceId: im.src, imageUrl: im.src, thumbnailUrl: im.src, sourceUrl: url, title: cleanText(im.alt), categories: ['photo'],
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
      categories: Array.isArray(raw.categories) ? raw.categories : ['photo'],
      license: 'Reshot License',
      licenseUrl: 'https://www.reshot.com/',
      licenseType: 'site-license',
      attributionRequired: false,
      commercialUse: true,
      modificationAllowed: true,
    };
  },
};
