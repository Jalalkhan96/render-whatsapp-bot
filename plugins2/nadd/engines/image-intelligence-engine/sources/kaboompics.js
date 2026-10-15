'use strict';
// Kaboompics adapter — curated free stock photos. License honesty: Kaboompics
// offers its own free license (commercial use allowed, no attribution required);
// it is a site license, not CC0 — never labeled 'free' without the license name.
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');
const SITE = 'https://kaboompics.com';

// Per-site selectors: gallery items link to /photo/<id> (some items to /<slug>).
// Try /photo/ card anchors, then JSON-LD, then generic card images.
function cardAnchors(html, pat, limit) {
  const out = [];
  const re = new RegExp('<a[^>]*href="([^"]*' + pat + '[^"]*)"[^>]*>([\\s\\S]*?)</a>', 'gi');
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
  id: 'kaboompics',
  name: 'Kaboompics',
  website: 'https://kaboompics.com/',
  type: 'photo',
  transport: 'page',
  docsUrl: 'https://kaboompics.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 29,
  tags: ['stock-photo', 'free-stock', 'lifestyle'],
  categories: ['photo', 'free-stock'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: {
    license: 'Kaboompics Free License',
    licenseUrl: 'https://kaboompics.com/',
    licenseType: 'site-license',
    attributionRequired: false,
    commercialUse: true,
    modificationAllowed: true,
    notes: 'Kaboompics free license allows commercial use without attribution. Site-specific license — not CC0 / public domain.',
  },
  async search(query, options, ctx) {
    const limit = Math.min((options && options.limit) || 20, 50);
    const url = SITE + '/gallery?search=' + encodeURIComponent(query);
    const html = await fetchHtml(ctx.http, url);
    let raws = cardAnchors(html, '/photo/', limit);
    if (!raws.length) raws = extractJsonLd(html).length
      ? jsonFallback(html, limit) : [];
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
      license: 'Kaboompics Free License',
      licenseUrl: 'https://kaboompics.com/',
      licenseType: 'site-license',
      attributionRequired: false,
      commercialUse: true,
      modificationAllowed: true,
    };
  },
};

// JSON-LD ImageObject fallback (kept local to this adapter).
function jsonFallback(html, limit) {
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
      });
    }
  }
  return out;
}
