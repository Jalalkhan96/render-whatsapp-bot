'use strict';
// Stockvault adapter — page scrape of stockvault.net search results.
// LICENSE: "free to use" is NOT public domain; attribution requirements vary
// per photo. Verify the license on the photo's page. licensePerImage.
const { fetchHtml, extractJsonLd, absolutizeUrl, cleanText } = require('../lib/scrape.js');

const ID = 'stockvault';
const BASE = 'https://www.stockvault.net/';
const HOST = BASE.replace(/\/$/, '');
const searchUrl = (q) => `https://www.stockvault.net/search?query=${encodeURIComponent(q)}`;

// PARSE: JSON-LD first, then same-host <a> tiles wrapping <img>.
// Selectors best-effort, UNVERIFIED (endpointVerified:false).
const SKIP_HREF = /\/(login|signin|signup|register|cart|checkout|pricing|plans|account)(\/|$|[?#])/i;
const IMG_RE = /ImageObject|Photograph|VisualArtwork|Painting|Book/i;

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
    else if (Array.isArray(n['@graph'])) list = n['@graph']
      .filter((g) => IMG_RE.test(String(g && g['@type'] || ''))).map((g) => [g, null]);
    for (const [item, url] of list) if (item && typeof item === 'object') push(item, url || item.url);
  }
  return raws;
}

function cardItems(html) {
  const raws = [];
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && raws.length < 60) {
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
  name: 'Stockvault',
  website: BASE,
  type: 'photo',
  transport: 'page',
  docsUrl: BASE,
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 25,
  tags: ['photo', 'free-stock'],
  categories: ['photo', 'free-stock'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: {
    license: 'Stockvault License',
    licenseUrl: BASE,
    licenseType: 'other',
    attributionRequired: null,
    commercialUse: true,
    modificationAllowed: null,
    notes: 'Free use; attribution requirements vary per photo — verify on the photo page.',
  },
  async search(query, options, ctx) {
    const limit = Math.min(50, Math.max(1, (options && options.limit) || 20));
    const q = String(query || '').trim();
    if (!q) return [];
    let html;
    try { html = await fetchHtml(ctx.http, searchUrl(q), { maxBytes: 1500 * 1024 }); }
    catch (err) { if (ctx && ctx.log) ctx.log(`${ID} search failed: ${err.message}`); return []; }
    const raws = ldItems(html);
    return (raws.length ? raws : cardItems(html)).slice(0, limit);
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
    out.metadata = { adapter: ID };
    return out;
  },
};
