'use strict';
// IconArchive adapter — search page scrape. License honesty: each icon set on
// IconArchive ships its own license; the default is Unknown with
// licensePerImage:true. Never assume "free" — many sets are personal-use only.
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): results link to
// https://www.iconarchive.com/show/<set>/<name>-icon.html with preview <img>.
const LINK_RE = /href="(https?:\/\/(?:www\.)?iconarchive\.com\/show\/[^"]+)"/gi;
const IMG_RE = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/i;

module.exports = {
  id: 'iconarchive',
  name: 'IconArchive',
  website: 'https://www.iconarchive.com/',
  type: 'icon',
  transport: 'page',
  docsUrl: 'https://www.iconarchive.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 68,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'Unknown (per-icon)', licenseUrl:'https://www.iconarchive.com/', licenseType:'unknown', attributionRequired:null, commercialUse:null, modificationAllowed:null, notes:'License varies per icon set; often personal-use only. Verify on the icon detail page. licensePerImage applies.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const url = 'https://www.iconarchive.com/search?q=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    const out = [];
    const seen = new Set();
    let m;
    while ((m = LINK_RE.exec(html)) && out.length < limit) {
      const pageUrl = m[1];
      if (seen.has(pageUrl)) continue;
      seen.add(pageUrl);
      const img = m[0].match(IMG_RE);
      out.push({
        sourceId: pageUrl,
        sourceUrl: pageUrl,
        title: img && img[2] ? cleanText(img[2]) : null,
        imageUrl: img ? absolutizeUrl(img[1], url) : null,
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
    // No license fields: unknown per-icon license. metadata flags per-image check.
    o.metadata = { query: raw.query || null, licensePerImage: true };
    return o;
  },
};
