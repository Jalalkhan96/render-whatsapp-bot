'use strict';
// WallpapersWide adapter — wallpapers via wallpaperswide.com search pages.
// License honesty: every result is license 'Unknown' with commercialUse:null —
// downloading ≠ permission for commercial reuse; check the source page.
// Selector basis (unverified markup, documented): result thumbs are anchors to
// /<slug>.html detail pages wrapping a thumbnail <img>; the card block often
// carries a resolution label (e.g. 1920x1080) which is appended to the title.
// Pipeline: per-site card regex -> JSON-LD -> generic extractImages.
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

const SEARCH = (q) => `https://wallpaperswide.com/search.html?q=${encodeURIComponent(q)}`;

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
  const re = /<a\b[^>]*href=(["'])(\/[^"']*?\.html)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const inner = m[3];
    const im = inner.match(/<img\b[^>]*(?:src|data-src|data-original)=(?:["'])([^"']+)(?:["'])/i);
    if (!im) continue;
    const img = absolutizeUrl(im[1], url);
    if (!img) continue;
    const alt = im[0].match(/alt=(["'])(.*?)\1/i);
    const res = inner.match(/(\d{3,5}\s*x\s*\d{3,5})/i);
    let title = alt ? cleanText(alt[2]) : null;
    if (res) title = (title ? title + ' — ' : '') + res[1].replace(/\s/g, '');
    out.push({
      id: m[2].replace(/^\/+|\.html$/g, '') || null,
      img,
      sourceUrl: absolutizeUrl(m[2], url),
      title,
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
    sourceId: raw.id ? 'wallpaperswide-' + raw.id : raw.img,
    imageUrl: raw.img,
    thumbnailUrl: raw.img,
    downloadUrl: raw.img,
    sourceUrl: raw.sourceUrl || 'https://wallpaperswide.com/',
    title: raw.title || 'WallpapersWide wallpaper',
    license: 'Unknown',
    licenseUrl: 'https://wallpaperswide.com/',
    licenseType: 'unknown',
    attributionRequired: null,
    commercialUse: null,
    modificationAllowed: null,
    metadata: { note: 'License varies per wallpaper; resolution in title when shown on the card.' },
  };
}

module.exports = {
  id: 'wallpaperswide',
  name: 'WallpapersWide',
  website: 'https://wallpaperswide.com/',
  type: 'wallpaper',
  transport: 'page',
  docsUrl: 'https://wallpaperswide.com/search.html?q={q}',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 96,
  tags: ['wallpaper'],
  categories: ['wallpaper'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: true, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: 'https://wallpaperswide.com/', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'downloadable ≠ reusable commercially; license varies per wallpaper — check the source page.' },
  search,
  mapResult,
};
