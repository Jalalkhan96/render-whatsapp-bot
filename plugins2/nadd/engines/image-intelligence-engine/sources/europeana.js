'use strict';
// Europeana adapter — license honesty: rights vary PER ITEM
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
  id: 'europeana',
  name: 'Europeana',
  website: 'https://www.europeana.eu/',
  type: 'archive',
  transport: 'api',
  docsUrl: 'https://pro.europeana.eu/page/apis',
  endpointVerified: true,
  requiresKey: true,
  envKey: 'EUROPEANA_API_KEY',
  enabled: true,
  priority: 11,
  tags: ['culture', 'heritage', 'aggregator', 'europe'],
  categories: ['archive', 'culture'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-item rights statement; verify the rights URL before reuse.' },
  async search(query, options, ctx) {
    const key = ctx.env('EUROPEANA_API_KEY');
    if (!key) throw new Error('europeana: API key missing — set EUROPEANA_API_KEY');
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({ wskey: key, query: query, rows: String(n), reusability: 'open' });
    const res = await ctx.http.get('https://api.europeana.eu/record/v2/search.json?' + params.toString());
    if (res.status !== 200) throw new Error('europeana: HTTP ' + res.status);
    const body = res.json();
    return (body && body.items) || [];
  },
  mapResult(raw) {
    const out = {
      sourceId: raw.id,
      imageUrl: raw.edmPreview,
      thumbnailUrl: raw.edmPreview,
      sourceUrl: raw.guid,
      title: Array.isArray(raw.title) ? raw.title.join('; ') : raw.title,
      creator: Array.isArray(raw.dcCreator) ? raw.dcCreator.join(', ') : raw.dcCreator,
      license: licenseFromUrl(raw.rights),
      licenseUrl: raw.rights || undefined,
      metadata: { dataProvider: raw.dataProvider, provider: raw.provider, country: raw.country },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
