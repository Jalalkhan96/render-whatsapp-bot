'use strict';
// Openclipart adapter — public-domain clipart. License honesty: Openclipart
// hosts clipart released into the public domain (CC0 / Public Domain Mark),
// so attribution is not required and commercial use is allowed per the site's
// terms. Per-image verification still advised.
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): result cards link to /detail/<id>/<slug>; the
// detail page JSON-LD (ImageObject) carries contentUrl + thumbnail.
const LINK_RE = /href="(https?:\/\/(?:www\.)?openclipart\.org\/detail\/\d+\/[^"]+)"/gi;
const TITLE_RE = /title="([^"]+)"/i;

module.exports = {
  id: 'openclipart',
  name: 'Openclipart',
  website: 'https://openclipart.org/',
  type: 'vector',
  transport: 'page',
  docsUrl: 'https://openclipart.org/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 63,
  tags: ['vector'],
  categories: ['vector'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'CC0 / Public Domain', licenseUrl:'https://openclipart.org/', licenseType:'public-domain', attributionRequired:false, commercialUse:true, modificationAllowed:true, notes:'Public-domain clipart library; confirm the detail page marks the item as public domain.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const url = 'https://openclipart.org/search/?query=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    const out = [];
    const seen = new Set();
    let m;
    while ((m = LINK_RE.exec(html)) && out.length < limit) {
      const pageUrl = m[1];
      if (seen.has(pageUrl)) continue;
      seen.add(pageUrl);
      const t = m[0].match(TITLE_RE);
      out.push({ sourceId: pageUrl, sourceUrl: pageUrl, title: t ? cleanText(t[1]) : null, query });
    }
    if (out.length === 0) {
      const imgs = extractImages(html, url, limit);
      for (const img of imgs) out.push({ sourceId: img.src, sourceUrl: url, imageUrl: img.src, title: img.alt ? cleanText(img.alt) : null, query });
    }
    return out;
  },

  mapResult(raw) {
    const o = { sourceId: raw.sourceId, sourceUrl: raw.sourceUrl };
    if (raw.imageUrl) { o.imageUrl = raw.imageUrl; o.thumbnailUrl = raw.imageUrl; o.downloadUrl = raw.imageUrl; }
    if (raw.title) o.title = raw.title;
    o.license = 'CC0 / Public Domain';
    o.attributionRequired = false;
    o.commercialUse = true;
    o.metadata = { query: raw.query || null };
    return o;
  },
};
