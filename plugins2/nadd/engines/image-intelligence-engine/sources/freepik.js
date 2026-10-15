'use strict';
// Freepik adapter — search page scrape. License honesty: the Freepik Free
// License REQUIRES attribution (e.g. "<a href=...>Image by ...</a> on
// Freepik") and is NOT unrestricted: commercial use has limits and a daily
// download cap applies. Never label Freepik results "free" without caveats.
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): Freepik search is heavily client-rendered, so we
// fall back to JSON-LD (ItemList/ImageObject) -> Open Graph -> generic images.
// Document-level link pattern for anchor recovery: /vector/<slug> etc.
const LINK_RE = /href="(https?:\/\/(?:www\.)?freepik\.com\/(?:vector|icon|illustration)[^"]+)"/gi;

function jsonLdImages(html, limit) {
  const out = [];
  try {
    for (const ld of extractJsonLd(html)) {
      const items = ld['@graph'] || [ld];
      for (const it of items) {
        const list = it.itemListElement || [];
        for (const el of list) {
          const img = el.item || el;
          const url = img.contentUrl || img.url || img.image;
          if (url && out.length < limit) out.push({ imageUrl: absolutizeUrl(url, 'https://www.freepik.com/'), title: img.name ? cleanText(img.name) : null, sourceUrl: img.url ? absolutizeUrl(img.url, 'https://www.freepik.com/') : null });
        }
        if (it.contentUrl && out.length < limit) out.push({ imageUrl: absolutizeUrl(it.contentUrl, 'https://www.freepik.com/'), title: it.name ? cleanText(it.name) : null, sourceUrl: it.url ? absolutizeUrl(it.url, 'https://www.freepik.com/') : null });
      }
    }
  } catch (e) { /* malformed JSON-LD -> ignore */ }
  return out;
}

module.exports = {
  id: 'freepik',
  name: 'Freepik',
  website: 'https://www.freepik.com/',
  type: 'vector',
  transport: 'page',
  docsUrl: 'https://www.freepik.com/legal/terms-of-use',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 64,
  tags: ['vector'],
  categories: ['vector'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'Freepik Free License', licenseUrl:'https://www.freepik.com/legal/terms-of-use', licenseType:'attribution-required', attributionRequired:true, commercialUse:null, modificationAllowed:null, notes:'Free tier requires attribution and has limits; NOT unrestricted. Verify per-asset license on the page.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const url = 'https://www.freepik.com/search?query=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    let out = jsonLdImages(html, limit).map(r => ({ ...r, sourceId: r.sourceUrl || r.imageUrl, query }));
    if (out.length === 0) {
      const og = extractOpenGraph(html);
      let m;
      while ((m = LINK_RE.exec(html)) && out.length < limit) out.push({ sourceId: m[1], sourceUrl: m[1], imageUrl: null, title: og.title ? cleanText(og.title) : null, query });
      if (out.length === 0) for (const img of extractImages(html, url, limit)) out.push({ sourceId: img.src, sourceUrl: url, imageUrl: img.src, title: img.alt ? cleanText(img.alt) : null, query });
    }
    return out.slice(0, limit);
  },

  mapResult(raw) {
    const o = { sourceId: raw.sourceId, sourceUrl: raw.sourceUrl };
    if (raw.imageUrl) { o.imageUrl = raw.imageUrl; o.thumbnailUrl = raw.imageUrl; }
    if (raw.title) o.title = raw.title;
    o.attributionRequired = true;
    o.metadata = { query: raw.query || null, licensePerImage: true };
    return o;
  },
};
