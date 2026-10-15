'use strict';
// Unsplash adapter — license honesty: Unsplash License permits free use incl.
// commercial and does not require attribution; it is NOT public domain and
// unaltered redistribution is restricted. Per Unsplash guidelines the download
// action should GET links.download_location with client_id.
module.exports = {
  id: 'unsplash',
  name: 'Unsplash',
  website: 'https://unsplash.com/',
  type: 'photo',
  transport: 'api',
  docsUrl: 'https://unsplash.com/documentation',
  endpointVerified: true,
  requiresKey: true,
  envKey: 'UNSPLASH_ACCESS_KEY',
  enabled: true,
  priority: 1,
  tags: ['free', 'stock', 'photography'],
  categories: ['photo', 'free-stock'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 50, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license', licenseType: 'proprietary', attributionRequired: false, commercialUse: true, modificationAllowed: true, notes: 'Free to use incl. commercial, no attribution required. Not public domain; redistribution of unaltered copies is restricted.' },
  async search(query, options, ctx) {
    const key = ctx.env('UNSPLASH_ACCESS_KEY');
    if (!key) throw new Error('unsplash: API key missing — set UNSPLASH_ACCESS_KEY');
    const n = Math.min((options && options.limit) || 10, 50);
    const url = 'https://api.unsplash.com/search/photos?query=' + encodeURIComponent(query) +
      '&per_page=' + n + '&client_id=' + encodeURIComponent(key);
    const res = await ctx.http.get(url, { headers: { 'Accept-Version': 'v1' } });
    if (res.status !== 200) throw new Error('unsplash: HTTP ' + res.status);
    const body = res.json();
    return (body && body.results) || [];
  },
  mapResult(raw) {
    const urls = raw.urls || {};
    const links = raw.links || {};
    const user = raw.user || {};
    const out = {
      sourceId: raw.id,
      imageUrl: urls.raw,
      thumbnailUrl: urls.small,
      downloadUrl: urls.raw,
      sourceUrl: links.html,
      title: raw.alt_description || raw.description || undefined,
      description: raw.description || undefined,
      creator: user.name,
      creatorUrl: user.links && user.links.html,
      width: raw.width,
      height: raw.height,
      colors: raw.color ? [raw.color] : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags.map(function (t) { return t && t.title; }).filter(Boolean) : undefined,
      license: 'Unsplash License',
      licenseUrl: 'https://unsplash.com/license',
      attributionRequired: false,
      commercialUse: true,
      metadata: { likes: raw.likes, downloadLocation: links.download_location },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
