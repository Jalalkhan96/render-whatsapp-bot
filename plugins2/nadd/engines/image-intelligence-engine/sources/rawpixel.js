'use strict';
// Rawpixel adapter — mixed free/premium stock library. License honesty: this is a
// FREE TIER with premium content alongside it — commercialUse and
// attributionRequired are both null (not assumed), and mapResult OMITS all
// license fields (licensePerImage: check the photo page before any reuse).
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');
const SITE = 'https://www.rawpixel.com';

// Per-site selectors: search cards are <a> (root-relative href, non-nav) wrapping
// an <img> (src + alt). JSON-LD ImageObjects tried first.
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
  id: 'rawpixel',
  name: 'Rawpixel',
  website: 'https://www.rawpixel.com/',
  type: 'photo',
  transport: 'page',
  docsUrl: 'https://www.rawpixel.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 22,
  tags: ['stock-photo', 'free-stock', 'premium'],
  categories: ['photo', 'free-stock'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: {
    license: 'Rawpixel Free Tier (verify per image)',
    licenseUrl: 'https://www.rawpixel.com/',
    licenseType: 'free-tier',
    attributionRequired: null,
    commercialUse: null,
    modificationAllowed: null,
    notes: 'Free tier exists but premium content is mixed in — do not assume unrestricted use. License is per-image (licensePerImage); check the photo page before reuse.',
  },
  async search(query, options, ctx) {
    const limit = Math.min((options && options.limit) || 20, 50);
    const url = SITE + '/search/' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    let raws = cardAnchors(html, limit);
    if (!raws.length) raws = extractImages(html, url, limit).map(im => ({
      sourceId: im.src, imageUrl: im.src, thumbnailUrl: im.src, sourceUrl: url, title: cleanText(im.alt),
    }));
    return raws;
  },
  mapResult(raw) {
    // license fields intentionally omitted — rights vary per image on Rawpixel.
    return {
      sourceId: raw.sourceId,
      imageUrl: raw.imageUrl,
      thumbnailUrl: raw.thumbnailUrl,
      sourceUrl: raw.sourceUrl,
      title: raw.title || '',
    };
  },
};
