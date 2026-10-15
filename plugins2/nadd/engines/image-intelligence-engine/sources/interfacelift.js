'use strict';
// InterfaceLIFT adapter — wallpapers from interfacelift.com browse pages.
// NO server-side search: this fetches the dated browse listing and filters
// CLIENT-SIDE by query tokens appearing in each wallpaper's title.
// License honesty: every result is license 'Unknown' with commercialUse:null —
// downloading ≠ permission for commercial reuse; check the source page.
// Selector basis (unverified markup, documented): entries are anchors to
// /wallpaper/details/<id>/<slug>.html wrapping a preview <img> with the
// wallpaper title in alt text or anchor text.
const { fetchHtml, absolutizeUrl, cleanText } = require('../lib/scrape.js');

const BROWSE = 'https://interfacelift.com/wallpaper/downloads/date/any/';

function tokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

async function search(query, options, ctx) {
  const limit = Math.min(Math.max(parseInt((options && options.limit) || 20, 10) || 20, 1), 50);
  const html = await fetchHtml(ctx.http, BROWSE, { timeout: 20000 });
  const qt = tokens(query);
  const out = [];
  const re = /<a\b[^>]*href=(["'])(\/wallpaper\/details\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const inner = m[3];
    const im = inner.match(/<img\b[^>]*(?:src|data-src|data-original)=(?:["'])([^"']+)(?:["'])/i);
    if (!im) continue;
    const img = absolutizeUrl(im[1], BROWSE);
    if (!img) continue;
    const alt = im[0].match(/alt=(["'])(.*?)\1/i);
    const title = cleanText(alt ? alt[2] : inner);
    if (!title) continue;
    // Client-side filtering: score by query-token overlap in the title.
    const bt = tokens(title);
    const overlap = qt.filter((t) => bt.some((b) => b === t || b.indexOf(t) === 0 || t.indexOf(b) === 0)).length;
    if (qt.length && overlap === 0) continue;
    const idm = m[2].match(/details\/(\d+)/);
    out.push({
      score: overlap,
      id: idm ? idm[1] : null,
      img,
      sourceUrl: absolutizeUrl(m[2], BROWSE),
      title,
    });
    if (out.length >= 200) break; // cap the client-side candidate pool
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map(({ score, ...rest }) => rest);
}

function mapResult(raw) {
  raw = raw || {};
  return {
    sourceId: raw.id ? 'interfacelift-' + raw.id : raw.img,
    imageUrl: raw.img,
    thumbnailUrl: raw.img,
    downloadUrl: raw.img,
    sourceUrl: raw.sourceUrl || BROWSE,
    title: raw.title || 'InterfaceLIFT wallpaper',
    license: 'Unknown',
    licenseUrl: 'https://interfacelift.com/',
    licenseType: 'unknown',
    attributionRequired: null,
    commercialUse: null,
    modificationAllowed: null,
    metadata: { note: 'Matched client-side by title tokens; no server-side search on this site.' },
  };
}

module.exports = {
  id: 'interfacelift',
  name: 'InterfaceLIFT',
  website: 'https://interfacelift.com/',
  type: 'wallpaper',
  transport: 'page',
  docsUrl: 'https://interfacelift.com/wallpaper/downloads/date/any/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 100,
  tags: ['wallpaper'],
  categories: ['wallpaper'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: true, vectors: false, illustrations: false, wallpapers: true, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 20, delayMs: 1500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: 'https://interfacelift.com/', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'downloadable ≠ reusable commercially; license varies per wallpaper — check the source page.' },
  search,
  mapResult,
};
