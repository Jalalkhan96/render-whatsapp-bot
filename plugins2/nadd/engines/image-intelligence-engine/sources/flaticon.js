'use strict';
// Flaticon adapter — search page scrape. License honesty: the Flaticon Free
// License REQUIRES attribution ("Icon made by <author> from flaticon.com") and
// is NOT unrestricted; the free tier is not a public-domain or MIT grant.
// Downloads may require login — treat downloadUrl as best-effort.
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): search is client-rendered; JSON-LD
// (ItemList of ImageObject) is the primary source, falling back to anchor
// hrefs matching /free-icon/<slug> and generic image extraction.
const LINK_RE = /href="(https?:\/\/(?:www\.)?flaticon\.com\/(?:free-icon|premium-icon)\/[^"]+)"/gi;

function jsonLdIcons(html, base, limit) {
  const out = [];
  try {
    for (const ld of extractJsonLd(html)) {
      for (const it of (ld['@graph'] || [ld])) {
        for (const el of (it.itemListElement || [])) {
          const img = el.item || el;
          const u = img.contentUrl || img.url || img.image;
          if (u && out.length < limit) out.push({ imageUrl: absolutizeUrl(u, base), title: img.name ? cleanText(img.name) : null, sourceUrl: img.url ? absolutizeUrl(img.url, base) : null });
        }
      }
    }
  } catch (e) { /* ignore malformed JSON-LD */ }
  return out;
}

module.exports = {
  id: 'flaticon',
  name: 'Flaticon',
  website: 'https://www.flaticon.com/',
  type: 'icon',
  transport: 'page',
  docsUrl: 'https://www.flaticon.com/legal',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 66,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'Flaticon Free License', licenseUrl:'https://www.flaticon.com/legal', licenseType:'attribution-required', attributionRequired:true, commercialUse:null, modificationAllowed:null, notes:'Free tier requires attribution (credit the author + flaticon.com). NOT unrestricted; verify per-icon on the page.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const url = 'https://www.flaticon.com/search?word=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    let out = jsonLdIcons(html, url, limit).map(r => ({ ...r, sourceId: r.sourceUrl || r.imageUrl, query }));
    if (out.length === 0) {
      let m;
      while ((m = LINK_RE.exec(html)) && out.length < limit) out.push({ sourceId: m[1], sourceUrl: m[1], imageUrl: null, title: null, query });
      if (out.length === 0) for (const img of extractImages(html, url, limit)) out.push({ sourceId: img.src, sourceUrl: url, imageUrl: img.src, title: img.alt ? cleanText(img.alt) : null, format: 'svg', query });
    }
    return out.slice(0, limit);
  },

  mapResult(raw) {
    const o = { sourceId: raw.sourceId, sourceUrl: raw.sourceUrl };
    if (raw.imageUrl) { o.imageUrl = raw.imageUrl; o.thumbnailUrl = raw.imageUrl; o.downloadUrl = raw.imageUrl; o.format = 'svg'; }
    if (raw.title) o.title = raw.title;
    o.attributionRequired = true;
    o.metadata = { query: raw.query || null, licensePerImage: true };
    return o;
  },
};
