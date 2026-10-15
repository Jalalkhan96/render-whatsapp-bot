'use strict';
// Cleveland Museum of Art adapter — license honesty: only works flagged
// open_access=true are CC0; anything else keeps license Unknown (omitted)
// so the normalizer marks it Unknown. Do not assume reuse rights for works
// still in copyright.
module.exports = {
  id: 'cleveland',
  name: 'Cleveland Museum of Art',
  website: 'https://www.clevelandart.org/',
  type: 'museum',
  transport: 'api',
  docsUrl: 'https://openaccess-api.clevelandart.org/',
  endpointVerified: true,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 17,
  tags: ['museum', 'open-access', 'art', 'cc0'],
  categories: ['museum', 'open-access', 'art'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'CC0 only for open_access works; otherwise Unknown.' },
  async search(query, options, ctx) {
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({ q: query, limit: String(n), has_image: '1' });
    const res = await ctx.http.get('https://openaccess-api.clevelandart.org/api/artworks/?' + params.toString());
    if (res.status !== 200) throw new Error('cleveland: HTTP ' + res.status);
    const body = res.json();
    return (body && body.data) || [];
  },
  mapResult(raw) {
    const cc0 = raw.open_access === true;
    const images = raw.images || {};
    const web = images.web || {};
    const out = {
      sourceId: raw.id,
      imageUrl: web.url,
      thumbnailUrl: web.url,
      sourceUrl: raw.url,
      title: raw.title || undefined,
      description: raw.technique || undefined,
      creator: Array.isArray(raw.creators) ? raw.creators.map(function (c) { return c && c.description; }).filter(Boolean).join(', ') || undefined : undefined,
      publishedAt: raw.creation_date || undefined,
      license: cc0 ? 'CC0' : undefined,
      licenseUrl: cc0 ? 'https://creativecommons.org/publicdomain/zero/1.0/' : undefined,
      attributionRequired: cc0 ? false : undefined,
      metadata: { department: raw.department, type: raw.type },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
