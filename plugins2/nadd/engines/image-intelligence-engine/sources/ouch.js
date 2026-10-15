'use strict';
// Icons8 Ouch adapter — illustration search page scrape. License honesty: Ouch
// illustrations are offered under the Icons8 Free License which REQUIRES
// attribution (link to icons8.com); the free tier does NOT permit unrestricted
// commercial use. Per-image license should be confirmed on the source page.
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): result links match /illustrations/<style>/<slug>
// e.g. https://icons8.com/illustrations/illustration/<slug>; titles in alt/title attrs.
const LINK_RE = /href="(https?:\/\/(?:www\.)?icons8\.com\/illustrations\/[^"]+)"/gi;
const ALT_RE = /alt="([^"]+)"/i;

module.exports = {
  id: 'ouch',
  name: 'Icons8 Ouch',
  website: 'https://icons8.com/',
  type: 'illustration',
  transport: 'page',
  docsUrl: 'https://icons8.com/license',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 61,
  tags: ['illustration'],
  categories: ['illustration'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:false, illustrations:true, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'Icons8 Free License', licenseUrl:'https://icons8.com/license', licenseType:'attribution-required', attributionRequired:true, commercialUse:null, modificationAllowed:null, notes:'Free tier of Icons8 Ouch illustrations; attribution required (link to icons8.com). Free-download is NOT unrestricted commercial use.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const url = 'https://icons8.com/illustrations/search?query=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    const out = [];
    const seen = new Set();
    let m;
    while ((m = LINK_RE.exec(html)) && out.length < limit) {
      const pageUrl = m[1];
      if (seen.has(pageUrl)) continue;
      seen.add(pageUrl);
      const alt = m[0].match(ALT_RE);
      out.push({ sourceId: pageUrl, sourceUrl: pageUrl, title: alt ? cleanText(alt[1]) : null, query });
    }
    if (out.length === 0) {
      // Fallback: JSON-LD -> OG -> generic image extraction for preview thumbs.
      const og = extractOpenGraph(html);
      const imgs = extractImages(html, url, limit);
      for (const img of imgs) {
        const o = { sourceId: img.src, sourceUrl: url, imageUrl: img.src, title: og.title ? cleanText(og.title) : null, query };
        if (img.alt) o.title = cleanText(img.alt);
        out.push(o);
      }
    }
    return out;
  },

  mapResult(raw) {
    const o = { sourceId: raw.sourceId, sourceUrl: raw.sourceUrl };
    if (raw.imageUrl) { o.imageUrl = raw.imageUrl; o.thumbnailUrl = raw.imageUrl; o.downloadUrl = raw.imageUrl; }
    if (raw.title) o.title = raw.title;
    o.type = 'illustration';
    o.metadata = { query: raw.query || null, licensePerImage: true };
    return o;
  },
};
