'use strict';
// ManyPixels adapter — illustration gallery at manypixels.co. NO SERVER SEARCH:
// single gallery fetch, CLIENT-SIDE token filter on title/alt (approximate).
// LICENSE: ManyPixels free license — check gallery terms per illustration.
const { fetchHtml, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

const ID = 'manypixels';
const BASE = 'https://www.manypixels.co/';
const HOST = BASE.replace(/\/$/, '');
const GALLERY_URL = 'https://www.manypixels.co/gallery';

// PARSE: JSON-LD first, then <a> cards wrapping <img>, then raw <img>s.
// Selectors best-effort, UNVERIFIED (endpointVerified:false).
const SKIP_HREF = /\/(login|signin|signup|register|cart|checkout|pricing|plans|account)(\/|$|[?#])/i;
const IMG_RE = /ImageObject|Photograph|VisualArtwork|Painting|Book/i;
const tokens = (q) => String(q || '').toLowerCase().split(/[^a-z0-9]+/g).filter((t) => t.length > 1);

function ldItems(html) {
  const raws = [];
  const push = (img, page) => {
    const s = img.contentUrl || img.image || img.url;
    const imageUrl = absolutizeUrl(typeof s === 'string' ? s : (s && s.url), BASE);
    if (!imageUrl) return;
    const a = img.author || img.creator;
    raws.push({ imageUrl,
      thumbnailUrl: absolutizeUrl(img.thumbnailUrl, BASE) || undefined,
      sourceUrl: absolutizeUrl(page || img.mainEntityOfPage, BASE) || undefined,
      title: cleanText(img.name || img.caption || img.headline) || undefined,
      description: cleanText(img.description) || undefined,
      creator: cleanText(typeof a === 'string' ? a : (a && a.name)) || undefined,
      license: cleanText(img.license) || undefined,
      publishedAt: img.datePublished || img.uploadDate || undefined });
  };
  for (const n of extractJsonLd(html)) {
    if (!n || typeof n !== 'object') continue;
    const t = String(n['@type'] || '');
    let list = [];
    if (/ItemList/i.test(t) && Array.isArray(n.itemListElement))
      list = n.itemListElement.map((li) => [(li && li.item) || li, li && li.url]);
    else if (IMG_RE.test(t)) list = [[n, null]];
    for (const [item, url] of list) if (item && typeof item === 'object') push(item, url || item.url);
  }
  return raws;
}

function cardItems(html) {
  const raws = [];
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && raws.length < 120) {
    const href = absolutizeUrl(m[1], BASE);
    if (!href || !href.startsWith(HOST) || SKIP_HREF.test(href)) continue;
    const img = m[2].match(/<img\b[^>]*>/i);
    if (!img) continue;
    const src = img[0].match(/\b(?:data-src|data-original|data-lazy-src|src)\s*=\s*["']([^"']+)["']/i);
    const imageUrl = absolutizeUrl(src && src[1], BASE);
    if (!imageUrl) continue;
    const alt = img[0].match(/\balt\s*=\s*["']([^"']*)["']/i);
    raws.push({ imageUrl, sourceUrl: href, title: cleanText(alt && alt[1]) || undefined });
  }
  return raws;
}
module.exports = {
  id: ID,
  name: 'ManyPixels',
  website: BASE,
  type: 'illustration',
  transport: 'page',
  docsUrl: BASE,
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 59,
  tags: ['illustration'],
  categories: ['illustration'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: true, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: {
    license: 'ManyPixels free license',
    licenseUrl: BASE,
    licenseType: 'other',
    attributionRequired: false,
    commercialUse: true,
    modificationAllowed: true,
    notes: 'Free license; check gallery terms per illustration.',
  },
  async search(query, options, ctx) {
    const limit = Math.min(50, Math.max(1, (options && options.limit) || 20));
    const q = String(query || '').trim();
    if (!q) return [];
    const toks = tokens(q);
    let html;
    try { html = await fetchHtml(ctx.http, GALLERY_URL, { maxBytes: 1500 * 1024 }); }
    catch (err) { if (ctx && ctx.log) ctx.log(`${ID} gallery fetch failed: ${err.message}`); return []; }
    let raws = ldItems(html);
    if (!raws.length) raws = cardItems(html);
    if (!raws.length) raws = extractImages(html, BASE, 120).map((im) => ({ imageUrl: im.src, title: cleanText(im.alt) || undefined }));
    return raws.filter((r) => toks.some((t) => `${r.title || ''} ${r.imageUrl || ''}`.toLowerCase().includes(t))).slice(0, limit);
  },
  mapResult(raw) {
    if (!raw || typeof raw !== 'object') return { sourceId: ID };
    const out = { sourceId: ID };
    if (raw.imageUrl) {
      out.imageUrl = raw.imageUrl;
      out.downloadUrl = raw.imageUrl;
      out.thumbnailUrl = raw.thumbnailUrl || raw.imageUrl;
      const f = String(raw.imageUrl).match(/\.([a-z0-9]{3,4})(?:[?#]|$)/i);
      if (f) out.format = f[1].toLowerCase();
    }
    for (const k of ['sourceUrl', 'title', 'description', 'creator', 'creatorUrl', 'width', 'height', 'publishedAt', 'orientation'])
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') out[k] = raw[k];
    for (const k of ['license', 'licenseUrl', 'licenseType', 'attributionRequired', 'commercialUse', 'modificationAllowed'])
      if (raw[k] !== undefined && raw[k] !== null) out[k] = raw[k];
    if (Array.isArray(raw.tags) && raw.tags.length) out.tags = raw.tags;
    out.metadata = { adapter: ID, clientSideFilter: true };
    return out;
  },
};
