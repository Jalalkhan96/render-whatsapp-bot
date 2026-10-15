'use strict';
// Iconduck adapter — search page scrape. License honesty: Iconduck aggregates
// open-source icon packs, each with its own license (MIT, Apache 2.0, CC...);
// the result card links the pack's license. Default is Unknown with
// licensePerImage:true — check the card/icon-page license before use.
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): results are icon cards linking to
// https://iconduck.com/icons/<id>/<slug>; card <img> carries the preview.
const CARD_RE = /<a[^>]+href="(\/icons\/[^"]+)"[^>]*>([\s\S]{0,800}?)(?:<\/a>)/gi;
const IMG_RE = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/i;
const LIC_RE = /(MIT|Apache 2\.0|CC0|CC BY[^"<]*)/i;

module.exports = {
  id: 'iconduck',
  name: 'Iconduck',
  website: 'https://iconduck.com/',
  type: 'icon',
  transport: 'page',
  docsUrl: 'https://iconduck.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 70,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'Unknown (per-icon)', licenseUrl:'https://iconduck.com/', licenseType:'unknown', attributionRequired:null, commercialUse:null, modificationAllowed:null, notes:'Open-source icon packs; license varies per pack (MIT, Apache 2.0, CC...). Captured from card when present; verify on the icon page. licensePerImage applies.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const url = 'https://iconduck.com/search?query=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    const out = [];
    let m;
    while ((m = CARD_RE.exec(html)) && out.length < limit) {
      const pageUrl = absolutizeUrl(m[1], url);
      const img = m[2].match(IMG_RE);
      if (!img) continue;
      const lic = m[2].match(LIC_RE);
      out.push({
        sourceId: pageUrl,
        sourceUrl: pageUrl,
        title: img[2] ? cleanText(img[2]) : null,
        imageUrl: absolutizeUrl(img[1], url),
        license: lic ? cleanText(lic[1]) : null,
        query,
      });
    }
    if (out.length === 0) for (const img of extractImages(html, url, limit)) out.push({ sourceId: img.src, sourceUrl: url, imageUrl: img.src, title: img.alt ? cleanText(img.alt) : null, license: null, query });
    return out;
  },

  mapResult(raw) {
    const o = { sourceId: raw.sourceId, sourceUrl: raw.sourceUrl };
    if (raw.imageUrl) { o.imageUrl = raw.imageUrl; o.thumbnailUrl = raw.imageUrl; o.downloadUrl = raw.imageUrl; o.format = 'svg'; }
    if (raw.title) o.title = raw.title;
    if (raw.license) { o.license = raw.license; o.licenseType = 'per-image'; }
    o.metadata = { query: raw.query || null, licensePerImage: true };
    return o;
  },
};
