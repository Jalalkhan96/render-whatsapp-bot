'use strict';
// SVG Repo adapter — per-icon license capture. License honesty: every icon on
// SVG Repo carries its own license (CC0, Public Domain, MIT, etc.) shown on the
// result card. The default below is Unknown with licensePerImage:true — do NOT
// treat svg-repo results as uniformly "free"; capture the card's license text.
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): result cards are <a class="..."> linking to
// /svg/<id>/<slug> with an <img> preview and a small license label nearby
// (e.g. <span>CC0</span>). Card-level license text is captured when present.
const CARD_RE = /<a[^>]+href="(\/svg\/[^"]+)"[^>]*>([\s\S]{0,900}?)(?:<\/a>)/gi;
const IMG_RE = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/i;
const LIC_RE = /<span[^>]*>(CC0|Public Domain|MIT|Apache[^<]*|GPL[^<]*)<\/span>/i;

module.exports = {
  id: 'svgrepo',
  name: 'SVG Repo',
  website: 'https://www.svgrepo.com/',
  type: 'vector',
  transport: 'page',
  docsUrl: 'https://www.svgrepo.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 62,
  tags: ['vector', 'icon'],
  categories: ['vector', 'icon'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'Unknown (per-icon)', licenseUrl:'https://www.svgrepo.com/', licenseType:'unknown', attributionRequired:null, commercialUse:null, modificationAllowed:null, notes:'License varies per icon (CC0, Public Domain, MIT...). Card license text captured when present; always verify on the icon page. licensePerImage applies.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const url = 'https://www.svgrepo.com/search/?query=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    const out = [];
    let m;
    while ((m = CARD_RE.exec(html)) && out.length < limit) {
      const inner = m[2];
      const img = inner.match(IMG_RE);
      if (!img) continue;
      const pageUrl = absolutizeUrl(m[1], url);
      const lic = inner.match(LIC_RE);
      out.push({
        sourceId: pageUrl,
        sourceUrl: pageUrl,
        title: img[2] ? cleanText(img[2]) : null,
        imageUrl: absolutizeUrl(img[1], url),
        license: lic ? cleanText(lic[1]) : null,
        query,
      });
    }
    if (out.length === 0) {
      const imgs = extractImages(html, url, limit);
      for (const img of imgs) out.push({ sourceId: img.src, sourceUrl: url, imageUrl: img.src, title: img.alt ? cleanText(img.alt) : null, license: null, query });
    }
    return out;
  },

  mapResult(raw) {
    const o = { sourceId: raw.sourceId, sourceUrl: raw.sourceUrl };
    if (raw.imageUrl) { o.imageUrl = raw.imageUrl; o.thumbnailUrl = raw.imageUrl; o.downloadUrl = raw.imageUrl; o.format = 'svg'; }
    if (raw.title) o.title = raw.title;
    // License captured from the card when present; omitted when unknown.
    if (raw.license) { o.license = raw.license; o.licenseType = 'per-image'; }
    o.metadata = { query: raw.query || null, licensePerImage: true };
    return o;
  },
};
