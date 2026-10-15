'use strict';
// Burst (Shopify) adapter — Shopify's free stock photo library. License honesty:
// site-specific Burst free license (commercial use allowed, no attribution);
// not CC0, not public domain — labeled as a site license, never 'free'.
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');
const SITE = 'https://burst.shopify.com';

// Per-site selectors: search cards are <a href="/photos/<slug>"> wrapping an <img>.
// JSON-LD ImageObjects are tried first.
function jsonLdImages(html, limit) {
  const out = [];
  for (const n of extractJsonLd(html)) {
    const list = (n['@type'] === 'ItemList' && Array.isArray(n.itemListElement))
      ? n.itemListElement.map(e => e.item || e) : [n];
    for (const it of list) {
      if (out.length >= limit) break;
      if (!it || (it['@type'] !== 'ImageObject' && it['@type'] !== 'Photograph')) continue;
      out.push({
        sourceId: absolutizeUrl(it.url || it.contentUrl, SITE),
        imageUrl: absolutizeUrl(it.contentUrl || it.url, SITE),
        sourceUrl: absolutizeUrl(it.mainEntityOfPage || it.url || it.contentUrl, SITE),
        title: cleanText(it.name || it.headline),
        creator: cleanText((it.creator && it.creator.name) || it.author),
      });
    }
  }
  return out;
}

function cardAnchors(html, limit) {
  const out = [];
  const re = /<a[^>]*href="([^"]*\/photos\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const img = /<img[^>]*>/i.exec(m[2]);
    if (!img) continue;
    const src = /(?:src|data-src)\s*=\s*"([^"]+)"/i.exec(img[0]);
    const alt = /alt\s*=\s*"([^"]*)"/i.exec(img[0]);
    out.push({
      sourceId: absolutizeUrl(m[1], SITE),
      imageUrl: absolutizeUrl(src && src[1], SITE),
      thumbnailUrl: absolutizeUrl(src && src[1], SITE),
      sourceUrl: absolutizeUrl(m[1], SITE),
      title: cleanText(alt && alt[1]),
    });
  }
  return out;
}

module.exports = {
  id: 'burst',
  name: 'Burst (Shopify)',
  website: 'https://burst.shopify.com/',
  type: 'photo',
  transport: 'page',
  docsUrl: 'https://burst.shopify.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 28,
  tags: ['stock-photo', 'free-stock', 'business', 'shopify'],
  categories: ['photo', 'free-stock', 'business'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: {
    license: 'Burst Free License',
    licenseUrl: 'https://burst.shopify.com/',
    licenseType: 'site-license',
    attributionRequired: false,
    commercialUse: true,
    modificationAllowed: true,
    notes: 'Burst free license allows commercial use without attribution. Site-specific license — not CC0 / public domain.',
  },
  async search(query, options, ctx) {
    const limit = Math.min((options && options.limit) || 20, 50);
    const url = SITE + '/search?q=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    let raws = jsonLdImages(html, limit);
    if (!raws.length) raws = cardAnchors(html, limit);
    if (!raws.length) raws = extractImages(html, url, limit).map(im => ({
      sourceId: im.src, imageUrl: im.src, thumbnailUrl: im.src, sourceUrl: url, title: cleanText(im.alt),
    }));
    return raws;
  },
  mapResult(raw) {
    return {
      sourceId: raw.sourceId,
      imageUrl: raw.imageUrl,
      thumbnailUrl: raw.thumbnailUrl,
      sourceUrl: raw.sourceUrl,
      title: raw.title || '',
      creator: raw.creator || '',
      license: 'Burst Free License',
      licenseUrl: 'https://burst.shopify.com/',
      licenseType: 'site-license',
      attributionRequired: false,
      commercialUse: true,
      modificationAllowed: true,
    };
  },
};
