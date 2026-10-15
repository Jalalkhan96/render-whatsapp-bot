'use strict';
// Openverse adapter — license honesty: license varies PER IMAGE (see
// licensePerImage comment). Attribution is required for all CC licenses
// except CC0 / Public Domain Mark. Trust-but-verify: Openverse asks users
// to confirm licensing on the source site before reuse.
// licensePerImage: true
module.exports = {
  id: 'openverse',
  name: 'Openverse',
  website: 'https://wordpress.org/openverse/',
  type: 'photo',
  transport: 'api',
  docsUrl: 'https://api.openverse.org/',
  endpointVerified: true,
  requiresKey: false,
  envKey: 'OPENVERSE_TOKEN',
  enabled: true,
  priority: 4,
  tags: ['cc', 'aggregator', 'photography'],
  categories: ['photo', 'aggregator'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 100, delayMs: 300, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-image license; verify on the source site before reuse.' },
  async search(query, options, ctx) {
    const n = Math.min((options && options.limit) || 10, 50);
    const f = (options && options.filters) || {};
    const params = new URLSearchParams({ q: query, page_size: String(n) });
    if (f.license === 'cc0') params.set('license', 'cc0');
    if (f.license === 'public-domain') params.set('license_type', 'all');
    const headers = {};
    const token = ctx.env('OPENVERSE_TOKEN');
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await ctx.http.get('https://api.openverse.org/v1/images/?' + params.toString(), { headers: headers });
    if (res.status !== 200) throw new Error('openverse: HTTP ' + res.status);
    const body = res.json();
    return (body && body.results) || [];
  },
  mapResult(raw) {
    const licenseMap = { cc0: 'CC0', pdm: 'Public Domain Mark', by: 'CC BY', 'by-sa': 'CC BY-SA', 'by-nc': 'CC BY-NC', 'by-nd': 'CC BY-ND', 'by-nc-sa': 'CC BY-NC-SA', 'by-nc-nd': 'CC BY-NC-ND' };
    const lic = raw.license;
    const license = licenseMap[lic];
    const out = {
      sourceId: raw.id,
      imageUrl: raw.url,
      thumbnailUrl: raw.thumbnail,
      sourceUrl: raw.foreign_landing_url,
      title: raw.title || undefined,
      creator: raw.creator || undefined,
      creatorUrl: raw.creator_url || undefined,
      width: raw.width,
      height: raw.height,
      license: license,
      licenseUrl: raw.license_url || undefined,
      attributionRequired: lic ? !(lic === 'cc0' || lic === 'pdm') : undefined,
      commercialUse: lic === 'by-nc' || lic === 'by-nc-sa' || lic === 'by-nc-nd' ? false : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags.map(function (t) { return t && t.name; }).filter(Boolean) : undefined,
      metadata: { licenseVerified: false, provider: raw.provider },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
