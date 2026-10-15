'use strict';
// Wallhaven adapter — license honesty: wallpapers are downloadable but reuse
// rights are NOT assumed. License stays Unknown (commercialUse null):
// free-download is not a commercial-use grant. Resolution is parsed from the
// "WxH" string; orientation may be derived from it by the consumer.
module.exports = {
  id: 'wallhaven',
  name: 'Wallhaven',
  website: 'https://wallhaven.cc/',
  type: 'wallpaper',
  transport: 'api',
  docsUrl: 'https://wallhaven.cc/help/api',
  endpointVerified: true,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 21,
  tags: ['wallpaper', 'desktop', 'backgrounds'],
  categories: ['wallpaper'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: true, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 45, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Wallpapers downloadable but NOT assumed reusable; check the uploader/source before reuse.' },
  async search(query, options, ctx) {
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({ q: query, categories: '111', purity: '100', per_page: String(n) });
    const res = await ctx.http.get('https://wallhaven.cc/api/v1/search?' + params.toString());
    if (res.status !== 200) throw new Error('wallhaven: HTTP ' + res.status);
    const body = res.json();
    return ((body && body.data) || []).slice(0, n); // API min page size is 24; enforce requested limit
  },
  mapResult(raw) {
    const resParts = typeof raw.resolution === 'string' ? raw.resolution.split('x') : [];
    const thumbs = raw.thumbs || {};
    const out = {
      sourceId: raw.id,
      imageUrl: raw.path,
      thumbnailUrl: thumbs.large || thumbs.original,
      sourceUrl: raw.url,
      title: raw.id ? 'Wallhaven ' + raw.id + ' ' + (raw.resolution || '') : undefined,
      width: resParts[0] ? parseInt(resParts[0], 10) : undefined,
      height: resParts[1] ? parseInt(resParts[1], 10) : undefined,
      colors: Array.isArray(raw.colors) ? raw.colors : undefined,
      categories: raw.category ? [raw.category] : undefined,
      metadata: { views: raw.views, favorites: raw.favorites, category: raw.category, purity: raw.purity },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
