'use strict';
// IconPark adapter — gallery page scrape. License honesty: IconPark icons are
// published by ByteDance under the Apache License 2.0 — a real permissive
// grant (no attribution required, commercial use allowed). The official
// gallery page is client-rendered; the search input token-filters icons by
// name, so server-side we can only fetch the gallery and token-match titles.
const { fetchHtml, extractOpenGraph, extractJsonLd, extractImages, absolutizeUrl, cleanText } = require('../lib/scrape.js');

// Per-site selectors (regex): gallery cards expose data-name tokens; previews
// are inline <svg>/<img>. We token-match client-side the same way the site's
// own filter does, then return matched cards. Documented limitation: without
// JS we cannot execute the token filter server-side beyond title text match.
const CARD_RE = /data-name="([^"]+)"[^>]*>([\s\S]{0,900}?)(?:<\/div>)/gi;
const IMG_RE = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/i;

function tokens(s) { return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

module.exports = {
  id: 'iconpark',
  name: 'IconPark',
  website: 'https://iconpark.oceanengine.com/',
  type: 'icon',
  transport: 'page',
  docsUrl: 'https://github.com/bytedance/iconpark',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 71,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:true, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:20, delayMs:1500, dailyLimit:null },
  defaultLicense: { license:'Apache License 2.0', licenseUrl:'https://www.apache.org/licenses/LICENSE-2.0', licenseType:'apache-2.0', attributionRequired:false, commercialUse:true, modificationAllowed:true, notes:'ByteDance IconPark icons under Apache 2.0. Gallery is client-side token-filtered; results approximate the site filter.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const url = 'https://iconpark.oceanengine.com/official';
    const html = await fetchHtml(ctx.http, url);
    const qt = new Set(tokens(query));
    const out = [];
    let m;
    while ((m = CARD_RE.exec(html)) && out.length < limit) {
      const name = cleanText(m[1]);
      const nt = tokens(name);
      if (![...qt].some(t => nt.some(n => n.includes(t) || t.includes(n)))) continue;
      const img = m[2].match(IMG_RE);
      out.push({
        sourceId: url + '#' + name,
        sourceUrl: url,
        title: name,
        imageUrl: img ? absolutizeUrl(img[1], url) : null,
        query,
      });
    }
    if (out.length === 0) for (const img of extractImages(html, url, limit)) out.push({ sourceId: img.src, sourceUrl: url, imageUrl: img.src, title: img.alt ? cleanText(img.alt) : null, format: 'svg', query });
    return out.slice(0, limit);
  },

  mapResult(raw) {
    const o = { sourceId: raw.sourceId, sourceUrl: raw.sourceUrl };
    if (raw.imageUrl) { o.imageUrl = raw.imageUrl; o.thumbnailUrl = raw.imageUrl; o.downloadUrl = raw.imageUrl; o.format = 'svg'; }
    if (raw.title) o.title = raw.title;
    o.license = 'Apache License 2.0';
    o.licenseUrl = 'https://www.apache.org/licenses/LICENSE-2.0';
    o.licenseType = 'apache-2.0';
    o.attributionRequired = false;
    o.commercialUse = true;
    o.metadata = { query: raw.query || null, clientSideTokenFilter: true };
    return o;
  },
};
