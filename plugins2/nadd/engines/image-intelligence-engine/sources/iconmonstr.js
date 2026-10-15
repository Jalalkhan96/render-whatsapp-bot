'use strict';
// Iconmonstr adapter — icon search page scrape. License honesty: iconmonstr's
// own license permits use without attribution and commercial use, but it is a
// site-specific grant — not CC0/PD, and not a universal "free for anything"
// promise. We state the license exactly as the site does.
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): results render as <div class="icon-box"> with
// an <a href="/<slug>/"> icon page and an <img> preview.
const BOX_RE = /<a[^>]+href="(\/[^"]+\/)"[^>]*class="[^"]*icon[^"]*"[^>]*>([\s\S]{0,600}?)(?:<\/a>)/gi;
const IMG_RE = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/i;

module.exports = {
  id: 'iconmonstr',
  name: 'Iconmonstr',
  website: 'https://iconmonstr.com/',
  type: 'icon',
  transport: 'page',
  docsUrl: 'https://iconmonstr.com/license/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 67,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'iconmonstr License', licenseUrl:'https://iconmonstr.com/license/', licenseType:'permissive', attributionRequired:false, commercialUse:true, modificationAllowed:true, notes:'Site-specific license: no attribution required, commercial use allowed. Not CC0/PD — read the license page.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const url = 'https://iconmonstr.com/search/?s=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    const out = [];
    let m;
    while ((m = BOX_RE.exec(html)) && out.length < limit) {
      const pageUrl = absolutizeUrl(m[1], url);
      const img = m[2].match(IMG_RE);
      out.push({
        sourceId: pageUrl,
        sourceUrl: pageUrl,
        title: img && img[2] ? cleanText(img[2]) : null,
        imageUrl: img ? absolutizeUrl(img[1], url) : null,
        query,
      });
    }
    if (out.length === 0) for (const img of extractImages(html, url, limit)) out.push({ sourceId: img.src, sourceUrl: url, imageUrl: img.src, title: img.alt ? cleanText(img.alt) : null, format: 'svg', query });
    return out;
  },

  mapResult(raw) {
    const o = { sourceId: raw.sourceId, sourceUrl: raw.sourceUrl };
    if (raw.imageUrl) { o.imageUrl = raw.imageUrl; o.thumbnailUrl = raw.imageUrl; o.downloadUrl = raw.imageUrl; o.format = 'svg'; }
    if (raw.title) o.title = raw.title;
    o.license = 'iconmonstr License';
    o.licenseUrl = 'https://iconmonstr.com/license/';
    o.attributionRequired = false;
    o.commercialUse = true;
    o.metadata = { query: raw.query || null };
    return o;
  },
};
