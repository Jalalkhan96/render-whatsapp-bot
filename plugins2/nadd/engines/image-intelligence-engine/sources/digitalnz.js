'use strict';
// DigitalNZ adapter — BEST-EFFORT (endpoint/shape UNVERIFIED). The adapter
// accepts search_results.results, results, or results[] shapes and maps
// defensively. rights is kept as licenseUrl; license is Unknown unless the
// record supplies a recognized license string. endpointVerified: false
module.exports = {
  id: 'digitalnz',
  name: 'DigitalNZ',
  website: 'https://digitalnz.org/',
  type: 'archive',
  transport: 'api',
  docsUrl: 'https://digitalnz.org/developers',
  endpointVerified: false,
  requiresKey: true,
  envKey: 'DIGITALNZ_API_KEY',
  enabled: true,
  priority: 45,
  tags: ['archive', 'culture', 'aggregator', 'new-zealand'],
  categories: ['archive'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-item rights; endpoint and response shape unverified.' },
  async search(query, options, ctx) {
    const key = ctx.env('DIGITALNZ_API_KEY');
    if (!key) throw new Error('digitalnz: API key missing — set DIGITALNZ_API_KEY');
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({ api_key: key, text: query });
    const res = await ctx.http.get('https://api.digitalnz.org/v3/records.json?' + params.toString());
    if (res.status !== 200) throw new Error('digitalnz: HTTP ' + res.status);
    const body = res.json() || {};
    const sr = body.search_results || {};
    const results = sr.results || body.results || [];
    return results.slice(0, n);
  },
  mapResult(raw) {
    const out = {
      sourceId: raw.id,
      imageUrl: raw.large_thumbnail_url || raw.thumbnail_url,
      thumbnailUrl: raw.thumbnail_url || raw.large_thumbnail_url,
      sourceUrl: raw.landing_url,
      title: raw.title || undefined,
      creator: raw.creator || undefined,
      licenseUrl: raw.rights || undefined,
      publishedAt: raw.date || undefined,
      tags: Array.isArray(raw.subject) ? raw.subject : undefined,
      metadata: { unverified: true, category: raw.category },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
