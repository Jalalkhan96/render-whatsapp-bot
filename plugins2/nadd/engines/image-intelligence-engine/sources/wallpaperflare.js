'use strict';
// WallpaperFlare adapter — wallpapers via wallpaperflare.com search pages.
// License honesty: every result is license 'Unknown' with commercialUse:null —
// downloading ≠ permission for commercial reuse; check the source page.
// Selector basis (unverified markup, documented): result cards are anchors to
// /wallpaper/<slug> pages wrapping a thumbnail <img> served from the site's
// wallpaper CDN (c4.wallpaperflare.com). Per-card download links require the
// detail page, so the thumb is imageUrl and the card page is sourceUrl.
// Pipeline: per-site card regex -> JSON-LD -> generic extractImages.
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

const SEARCH = (q) => `https://www.wallpaperflare.com/search?wallpaper=${encodeURIComponent(q)}`;

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
  const re = /<a\b[^>]*href=(["'])(\/wallpaper\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const inner = m[3];
    const im = inner.match(/<img\b[^>]*(?:src|data-src|data-original)=(?:["'])([^"']+)(?:["'])/i);
    if (!im) continue;
    const img = absolutizeUrl(im[1], url);
    if (!img) continue;
    const alt = im[0].match(/alt=(["'])(.*?)\1/i);
    out.push({
      id: m[2].replace(/^\/wallpaper\//, '').replace(/\/+$/, '') || null,
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
    sourceId: raw.id ? 'wallpaperflare-' + raw.id : raw.img,
    imageUrl: raw.img,
    thumbnailUrl: raw.img,
    downloadUrl: raw.img,
    sourceUrl: raw.sourceUrl || 'https://www.wallpaperflare.com/',
    title: raw.title || 'WallpaperFlare wallpaper',
    license: 'Unknown',
    licenseUrl: 'https://www.wallpaperflare.com/',
    licenseType: 'unknown',
    attributionRequired: null,
    commercialUse: null,
    modificationAllowed: null,
    metadata: { note: 'License varies per wallpaper; check the source page before reuse.' },
  };
}

module.exports = {
  id: 'wallpaperflare',
  name: 'WallpaperFlare',
  website: 'https://www.wallpaperflare.com/',
  type: 'wallpaper',
  transport: 'page',
  docsUrl: 'https://www.wallpaperflare.com/search?wallpaper={q}',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 95,
  tags: ['wallpaper'],
  categories: ['wallpaper'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: true, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: 'https://www.wallpaperflare.com/', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'downloadable ≠ reusable commercially; license varies per wallpaper — check the source page.' },
  search,
  mapResult,
};
