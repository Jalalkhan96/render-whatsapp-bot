'use strict';
// Findicons adapter — search page scrape. License honesty: Findicons hosts
// icons with varying per-icon licenses (many are author-specified, some
// commercial). Default is Unknown with licensePerImage:true — never "free".
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): results are <a href="/icon/<slug>"> cards with
// an <img> preview and alt title text.
const CARD_RE = /<a[^>]+href="(\/icon\/[^"]+)"[^>]*>([\s\S]{0,700}?)(?:<\/a>)/gi;
const IMG_RE = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/i;

module.exports = {
  id: 'findicons',
  name: 'Findicons',
  website: 'https://findicons.com/',
  type: 'icon',
  transport: 'page',
  docsUrl: 'https://findicons.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 69,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'Unknown (per-icon)', licenseUrl:'https://findicons.com/', licenseType:'unknown', attributionRequired:null, commercialUse:null, modificationAllowed:null, notes:'License varies per icon/author. Verify on the icon detail page. licensePerImage applies.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const slug = encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, '+'));
    const url = 'https://findicons.com/search/' + slug;
    const html = await fetchHtml(ctx.http, url);
    const out = [];
    let m;
    while ((m = CARD_RE.exec(html)) && out.length < limit) {
      const pageUrl = absolutizeUrl(m[1], url);
      const img = m[2].match(IMG_RE);
      if (!img) continue;
      out.push({
        sourceId: pageUrl,
        sourceUrl: pageUrl,
        title: img[2] ? cleanText(img[2]) : null,
        imageUrl: absolutizeUrl(img[1], url),
        query,
      });
    }
    if (out.length === 0) for (const img of extractImages(html, url, limit)) out.push({ sourceId: img.src, sourceUrl: url, imageUrl: img.src, title: img.alt ? cleanText(img.alt) : null, query });
    return out;
  },

  mapResult(raw) {
    const o = { sourceId: raw.sourceId, sourceUrl: raw.sourceUrl };
    if (raw.imageUrl) { o.imageUrl = raw.imageUrl; o.thumbnailUrl = raw.imageUrl; o.downloadUrl = raw.imageUrl; o.format = 'svg'; }
    if (raw.title) o.title = raw.title;
    o.metadata = { query: raw.query || null, licensePerImage: true };
    return o;
  },
};
