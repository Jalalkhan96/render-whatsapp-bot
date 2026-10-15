'use strict';
// WallpaperAccess adapter — wallpapers via wallpaperaccess.com search pages.
// License honesty: every result is license 'Unknown' with commercialUse:null —
// downloading ≠ permission for commercial reuse; check the source page.
// Selector basis (unverified markup, documented): result cards are anchors
// linking to /<slug> wrapping an <img> whose src sits under /full/ (full-size
// file). Pipeline: per-site card regex -> JSON-LD -> generic extractImages.
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

const SEARCH = (q) => `https://wallpaperaccess.com/search/${encodeURIComponent(q)}`;

function jsonLdImages(html, base) {
  const urls = [];
  for (const n of extractJsonLd(html)) {
    const nodes = Array.isArray(n) ? n : [n];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const cand = [];
      if (typeof node.image === 'string') cand.push(node.image);
      else if (Array.isArray(node.image)) cand.push(...node.image.filter((x) => typeof x === 'string'));
      else if (node.image && typeof node.image.url === 'string') cand.push(node.image.url);
      for (const u of cand) {
        const abs = absolutizeUrl(u, base);
        if (abs && !urls.includes(abs)) urls.push(abs);
      }
    }
  }
  return urls;
}

async function search(query, options, ctx) {
  const limit = Math.min(Math.max(parseInt((options && options.limit) || 20, 10) || 20, 1), 50);
  const url = SEARCH(query);
  const html = await fetchHtml(ctx.http, url, { timeout: 20000 });
  const out = [];
  const re = /<a\b[^>]*href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const inner = m[3];
    const im = inner.match(/<img\b[^>]*(?:src|data-src|data-original)=(?:["'])([^"']+)(?:["'])/i);
    if (!im) continue;
    const img = absolutizeUrl(im[1], url);
    if (!img || img.indexOf('/full/') < 0) continue; // per-site: full files under /full/
    const alt = im[0].match(/alt=(["'])(.*?)\1/i);
    const slug = m[2].replace(/^\/+|\/+$/g, '');
    out.push({
      id: slug || null,
      img,
      sourceUrl: absolutizeUrl(m[2], url),
      title: alt ? cleanText(alt[2]) : null,
    });
  }
  if (!out.length) {
    for (const u of jsonLdImages(html, url)) {
      if (out.length >= limit) break;
      out.push({ id: null, img: u, sourceUrl: url, title: null });
    }
    for (const img of extractImages(html, url, limit)) {
      if (out.length >= limit) break;
      out.push({ id: null, img: img.src, sourceUrl: url, title: img.alt ? cleanText(img.alt) : null });
    }
  }
  return out.slice(0, limit);
}

function mapResult(raw) {
  raw = raw || {};
  return {
    sourceId: raw.id ? 'wallpaperaccess-' + raw.id : raw.img,
    imageUrl: raw.img,
    thumbnailUrl: raw.img,
    downloadUrl: raw.img,
    sourceUrl: raw.sourceUrl || 'https://wallpaperaccess.com/',
    title: raw.title || 'WallpaperAccess wallpaper',
    license: 'Unknown',
    licenseUrl: 'https://wallpaperaccess.com/',
    licenseType: 'unknown',
    attributionRequired: null,
    commercialUse: null,
    modificationAllowed: null,
    metadata: { note: 'License varies per wallpaper; check the source page before reuse.' },
  };
}

module.exports = {
  id: 'wallpaperaccess',
  name: 'WallpaperAccess',
  website: 'https://wallpaperaccess.com/',
  type: 'wallpaper',
  transport: 'page',
  docsUrl: 'https://wallpaperaccess.com/search/{q}',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 93,
  tags: ['wallpaper'],
  categories: ['wallpaper'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: true, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: 'https://wallpaperaccess.com/', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'downloadable ≠ reusable commercially; license varies per wallpaper — check the source page.' },
  search,
  mapResult,
};
