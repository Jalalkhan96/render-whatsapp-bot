'use strict';
// Pexels adapter — license honesty: Pexels License allows free use incl.
// commercial without attribution; it is NOT public domain. Free download
// does not imply the right to sell unaltered copies or identify people in
// the photos.
module.exports = {
  id: 'pexels',
  name: 'Pexels',
  website: 'https://www.pexels.com/',
  type: 'photo',
  transport: 'api',
  docsUrl: 'https://www.pexels.com/api/documentation/',
  endpointVerified: true,
  requiresKey: true,
  envKey: 'PEXELS_API_KEY',
  enabled: true,
  priority: 2,
  tags: ['free', 'stock', 'photography'],
  categories: ['photo', 'free-stock'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/', licenseType: 'proprietary', attributionRequired: false, commercialUse: true, modificationAllowed: true, notes: 'Free to use incl. commercial, no attribution required. Not public domain; do not sell unaltered copies.' },
  async search(query, options, ctx) {
    const key = ctx.env('PEXELS_API_KEY');
    if (!key) throw new Error('pexels: API key missing — set PEXELS_API_KEY');
    const n = Math.min((options && options.limit) || 10, 50);
    const f = (options && options.filters) || {};
    const params = new URLSearchParams({ query: query, per_page: String(n) });
    if (['landscape', 'portrait', 'square'].indexOf(f.orientation) !== -1) params.set('orientation', f.orientation);
    if (['large', 'medium', 'small'].indexOf(f.size) !== -1) params.set('size', f.size);
    const res = await ctx.http.get('https://api.pexels.com/v1/search?' + params.toString(), { headers: { Authorization: key } });
    if (res.status !== 200) throw new Error('pexels: HTTP ' + res.status);
    const body = res.json();
    return (body && body.photos) || [];
  },
  mapResult(raw) {
    const src = raw.src || {};
    const out = {
      sourceId: raw.id,
      imageUrl: src.original,
      thumbnailUrl: src.medium,
      downloadUrl: src.original,
      sourceUrl: raw.url,
      title: raw.alt || undefined,
      creator: raw.photographer,
      creatorUrl: raw.photographer_url,
      width: raw.width,
      height: raw.height,
      colors: raw.avg_color ? [raw.avg_color] : undefined,
      license: 'Pexels License',
      licenseUrl: 'https://www.pexels.com/license/',
      attributionRequired: false,
      commercialUse: true,
      metadata: { liked: raw.liked },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
