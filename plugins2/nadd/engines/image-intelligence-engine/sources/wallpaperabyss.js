'use strict';
// Wallpaper Abyss adapter — wallpapers via wall.alphacoders.com search pages.
// License honesty: every result is license 'Unknown' with commercialUse:null —
// downloading ≠ permission for commercial reuse; check the source page.
// Selector basis (unverified markup, documented): search result thumbs are
// <a href="/big.php?i=<id>"> wrapping a thumb <img>. The full image lives on
// the detail page, so imageUrl/thumbnailUrl use the thumb and the detail page
// becomes sourceUrl (noted in metadata).
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

const SEARCH = (q) => `https://wall.alphacoders.com/search.php?search=${encodeURIComponent(q)}`;

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
      if (typeof node.thumbnailUrl === 'string') cand.push(node.thumbnailUrl);
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
  const re = /<a\b[^>]*href=(["'])(\/big\.php\?i=\d+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const inner = m[3];
    const im = inner.match(/<img\b[^>]*src=(["'])(.*?)\1/i);
    if (!im) continue;
    const thumb = absolutizeUrl(im[2], url);
    if (!thumb) continue;
    const alt = inner.match(/<img\b[^>]*alt=(["'])(.*?)\1/i);
    const idm = m[2].match(/i=(\d+)/);
    out.push({
      id: idm ? idm[1] : null,
      thumb,
      sourceUrl: absolutizeUrl(m[2], url),
      title: alt ? cleanText(alt[2]) : null,
    });
  }
  if (!out.length) {
    // JSON-LD -> generic images fallback chain, graceful when cards change.
    for (const u of jsonLdImages(html, url)) {
      if (out.length >= limit) break;
      out.push({ id: null, thumb: u, sourceUrl: url, title: null });
    }
    for (const img of extractImages(html, url, limit)) {
      if (out.length >= limit) break;
      out.push({ id: null, thumb: img.src, sourceUrl: url, title: img.alt ? cleanText(img.alt) : null });
    }
  }
  return out.slice(0, limit);
}

function mapResult(raw) {
  raw = raw || {};
  const meta = { note: 'imageUrl is the search-result thumbnail; the full-resolution file is on the detail page (sourceUrl).' };
  if (raw.id) meta.alphacodersId = raw.id;
  return {
    sourceId: raw.id ? 'wallpaperabyss-' + raw.id : raw.thumb,
    imageUrl: raw.thumb,
    thumbnailUrl: raw.thumb,
    downloadUrl: raw.thumb,
    sourceUrl: raw.sourceUrl || 'https://wall.alphacoders.com/',
    title: raw.title || 'Wallpaper Abyss wallpaper',
    license: 'Unknown',
    licenseUrl: 'https://wall.alphacoders.com/',
    licenseType: 'unknown',
    attributionRequired: null,
    commercialUse: null,
    modificationAllowed: null,
    metadata: meta,
  };
}

module.exports = {
  id: 'wallpaperabyss',
  name: 'Wallpaper Abyss',
  website: 'https://wall.alphacoders.com/',
  type: 'wallpaper',
  transport: 'page',
  docsUrl: 'https://wall.alphacoders.com/search.php?search={q}',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 92,
  tags: ['wallpaper'],
  categories: ['wallpaper'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: true, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: 'https://wall.alphacoders.com/', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'downloadable ≠ reusable commercially; license varies per wallpaper — check the source page.' },
  search,
  mapResult,
};
