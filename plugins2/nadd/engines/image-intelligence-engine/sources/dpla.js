'use strict';
// DPLA adapter — license honesty: rights vary PER ITEM
// (see licensePerImage comment). The `rights` field is a URL kept as
// licenseUrl; a human-readable license name is only set for recognized
// Creative Commons URL patterns, otherwise the field is omitted (Unknown).
// licensePerImage: true
function licenseFromUrl(url) {
  if (!url || typeof url !== 'string') return undefined;
  const m = url.match(/creativecommons\.org\/(?:publicdomain\/(zero)\/1\.0|licenses\/(by(?:-[a-z]+)*)\/\d)/);
  if (!m) return undefined;
  if (m[1] === 'zero') return 'CC0';
  const suffix = (m[2] || '').toUpperCase().replace(/-/g, ' ');
  return 'CC ' + suffix;
}

module.exports = {
  id: 'dpla',
  name: 'Digital Public Library of America',
  website: 'https://dp.la/',
  type: 'archive',
  transport: 'api',
  docsUrl: 'https://pro.dp.la/developers/api-codex',
  endpointVerified: true,
  requiresKey: true,
  envKey: 'DPLA_API_KEY',
  enabled: true,
  priority: 13,
  tags: ['archive', 'public-domain', 'library', 'aggregator'],
  categories: ['archive', 'public-domain'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-item rights statement; verify the rights URL before reuse.' },
  async search(query, options, ctx) {
    const key = ctx.env('DPLA_API_KEY');
    if (!key) throw new Error('dpla: API key missing — set DPLA_API_KEY');
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({ q: query, api_key: key, page_size: String(n) });
    const res = await ctx.http.get('https://api.dp.la/v2/items?' + params.toString());
    if (res.status !== 200) throw new Error('dpla: HTTP ' + res.status);
    const body = res.json();
    return (body && body.docs) || [];
  },
  mapResult(raw) {
    const sr = raw.sourceResource || {};
    const str = function (v) { return Array.isArray(v) ? v.join('; ') : (v || undefined); };
    const out = {
      sourceId: raw.id,
      imageUrl: raw.object,
      thumbnailUrl: raw.object,
      sourceUrl: raw.isShownAt,
      title: String(sr.title || '') || undefined,
      description: str(sr.description),
      creator: str(sr.creator),
      tags: sr.subject || undefined,
      license: licenseFromUrl(raw.rights),
      licenseUrl: raw.rights || undefined,
      metadata: { provider: raw.provider && raw.provider.name, dataProvider: raw.dataProvider },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
