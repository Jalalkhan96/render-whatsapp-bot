'use strict';
// Pixabay adapter — license honesty: Pixabay Content License allows free use
// incl. commercial without attribution; it is NOT public domain. "No known
// copyright restrictions" style notes are not blanket commercial-use grants.
module.exports = {
  id: 'pixabay',
  name: 'Pixabay',
  website: 'https://pixabay.com/',
  type: 'photo',
  transport: 'api',
  docsUrl: 'https://pixabay.com/api/docs/',
  endpointVerified: true,
  requiresKey: true,
  envKey: 'PIXABAY_API_KEY',
  enabled: true,
  priority: 3,
  tags: ['free', 'stock', 'photography'],
  categories: ['photo', 'free-stock'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 100, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/', licenseType: 'proprietary', attributionRequired: false, commercialUse: true, modificationAllowed: true, notes: 'Free to use incl. commercial, no attribution required. Not public domain; do not sell unaltered copies.' },
  async search(query, options, ctx) {
    const key = ctx.env('PIXABAY_API_KEY');
    if (!key) throw new Error('pixabay: API key missing — set PIXABAY_API_KEY');
    const n = Math.min((options && options.limit) || 10, 50);
    const f = (options && options.filters) || {};
    const params = new URLSearchParams({ key: key, q: query, image_type: 'photo', per_page: String(n) });
    if (f.orientation === 'landscape') params.set('orientation', 'horizontal');
    else if (f.orientation === 'portrait') params.set('orientation', 'vertical');
    if (typeof f.category === 'string' && f.category) params.set('category', f.category);
    const res = await ctx.http.get('https://pixabay.com/api/?' + params.toString());
    if (res.status !== 200) throw new Error('pixabay: HTTP ' + res.status);
    const body = res.json();
    return (body && body.hits) || [];
  },
  mapResult(raw) {
    const out = {
      sourceId: raw.id,
      imageUrl: raw.largeImageURL,
      thumbnailUrl: raw.previewURL,
      downloadUrl: raw.largeImageURL,
      sourceUrl: raw.pageURL,
      title: undefined,
      creator: raw.user,
      creatorUrl: (raw.user && raw.user_id) ? 'https://pixabay.com/users/' + encodeURIComponent(raw.user) + '-' + raw.user_id + '/' : undefined,
      width: raw.imageWidth,
      height: raw.imageHeight,
      filesize: raw.imageSize,
      tags: typeof raw.tags === 'string' ? raw.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : undefined,
      license: 'Pixabay Content License',
      licenseUrl: 'https://pixabay.com/service/license-summary/',
      attributionRequired: false,
      commercialUse: true,
      metadata: { likes: raw.likes, downloads: raw.downloads, views: raw.views },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
