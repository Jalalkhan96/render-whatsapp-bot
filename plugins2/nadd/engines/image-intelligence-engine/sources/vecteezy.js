'use strict';
// Vecteezy adapter — free-photos search scrape. License honesty: Vecteezy's
// free license REQUIRES attribution (link to vecteezy.com or the contributor)
// and has limits; it is NOT an unrestricted "free" license. Pro/licensed items
// are excluded from this free-results adapter.
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): free-photo cards link to /photo/<id>-<slug> or
// /vector/... pages; preview <img> tags carry src + alt titles.
const CARD_RE = /<a[^>]+href="((?:https?:)?\/\/(?:www\.)?vecteezy\.com\/(?:photo|vector)[^"]+)"[^>]*>([\s\S]{0,800}?)(?:<\/a>)/gi;
const IMG_RE = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/i;

module.exports = {
  id: 'vecteezy',
  name: 'Vecteezy',
  website: 'https://www.vecteezy.com/',
  type: 'vector',
  transport: 'page',
  docsUrl: 'https://www.vecteezy.com/licensing',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 65,
  tags: ['vector'],
  categories: ['vector'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'Vecteezy Free License', licenseUrl:'https://www.vecteezy.com/licensing', licenseType:'attribution-required', attributionRequired:true, commercialUse:null, modificationAllowed:null, notes:'Free license requires attribution (link to Vecteezy/contributor). NOT unrestricted; verify per-asset terms on the page.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const slug = encodeURIComponent(query.trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-'));
    const url = 'https://www.vecteezy.com/free-photos/' + slug;
    const html = await fetchHtml(ctx.http, url);
    const out = [];
    let m;
    while ((m = CARD_RE.exec(html)) && out.length < limit) {
      const pageUrl = m[1].startsWith('//') ? 'https:' + m[1] : m[1];
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
    if (raw.imageUrl) { o.imageUrl = raw.imageUrl; o.thumbnailUrl = raw.imageUrl; o.downloadUrl = raw.imageUrl; }
    if (raw.title) o.title = raw.title;
    o.attributionRequired = true;
    o.metadata = { query: raw.query || null, licensePerImage: true };
    return o;
  },
};
