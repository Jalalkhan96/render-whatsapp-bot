'use strict';
// PICRYL adapter — BEST-EFFORT (endpoint/shape UNVERIFIED). The adapter
// accepts {data:[]}, {images:[]} or {results:[]} shapes and maps fields
// defensively from whichever aliases are present. License stays Unknown
// unless the item provides one; PICRYL items are mostly public domain but
// that is NOT claimed per image. endpointVerified: false
module.exports = {
  id: 'picryl',
  name: 'PICRYL',
  website: 'https://picryl.com/',
  type: 'archive',
  transport: 'api',
  docsUrl: 'https://picryl.com/doc/api',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 19,
  tags: ['archive', 'public-domain', 'history'],
  categories: ['archive', 'public-domain'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-image rights; mostly public domain but not claimed per image.' },
  async search(query, options, ctx) {
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({ search: query });
    const res = await ctx.http.get('https://api.picryl.com/api/v1/images?' + params.toString());
    if (res.status !== 200) throw new Error('picryl: HTTP ' + res.status);
    const body = res.json() || {};
    const results = body.data || body.images || body.results || [];
    return results.slice(0, n);
  },
  mapResult(raw) {
    const out = {
      sourceId: raw.id,
      imageUrl: raw.image_url || raw.url,
      thumbnailUrl: raw.thumbnail_url || raw.image_url,
      sourceUrl: raw.source_url || raw.page_url,
      title: raw.title || undefined,
      creator: raw.creator || undefined,
      license: raw.license || undefined,
      licenseUrl: raw.license_url || undefined,
      tags: Array.isArray(raw.tags) ? raw.tags : (typeof raw.tags === 'string' ? raw.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : undefined),
      metadata: { unverified: true },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
