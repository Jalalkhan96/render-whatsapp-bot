'use strict';
// NYPL Digital Collections adapter — BEST-EFFORT (endpoint/shape UNVERIFIED).
// The search endpoint and response shape are guesses; the adapter accepts
// nyplAPI.response.result[] or results[] and maps defensively. The image URL
// pattern below is UNVERIFIED — do not rely on it for downloads without a
// live check. License is left Unknown unless the item itself provides one.
// endpointVerified: false
module.exports = {
  id: 'nypl',
  name: 'NYPL Digital Collections',
  website: 'https://www.nypl.org/',
  type: 'archive',
  transport: 'api',
  docsUrl: 'https://api.repo.nypl.org/',
  endpointVerified: false,
  requiresKey: true,
  envKey: 'NYPL_API_TOKEN',
  enabled: true,
  priority: 14,
  tags: ['archive', 'library', 'public-domain'],
  categories: ['archive', 'public-domain'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-item rights; endpoint and image URL pattern unverified.' },
  async search(query, options, ctx) {
    const key = ctx.env('NYPL_API_TOKEN');
    if (!key) throw new Error('nypl: API key missing — set NYPL_API_TOKEN');
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({ q: query, token: key });
    const res = await ctx.http.get('https://api.repo.nypl.org/api/v2/items/search?' + params.toString());
    if (res.status !== 200) throw new Error('nypl: HTTP ' + res.status);
    const body = res.json() || {};
    const nypl = body.nyplAPI && body.nyplAPI.response;
    const results = (nypl && nypl.result) || body.results || [];
    return results.slice(0, n);
  },
  mapResult(raw) {
    const uuid = raw.uuid || raw.id;
    // UNVERIFIED image pattern — comment only, may not resolve.
    const imageUrl = raw.imageID ? 'https://images.nypl.org/index.php?id=' + raw.imageID + '&t=w' : undefined;
    const out = {
      sourceId: uuid,
      imageUrl: imageUrl,
      thumbnailUrl: imageUrl,
      sourceUrl: uuid ? 'https://digitalcollections.nypl.org/items/' + uuid : undefined,
      title: raw.title || undefined,
      creator: raw.creator || undefined,
      publishedAt: raw.date || raw.dateCreated || undefined,
      metadata: { unverified: true },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
