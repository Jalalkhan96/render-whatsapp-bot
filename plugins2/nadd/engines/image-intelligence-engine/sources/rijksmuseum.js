'use strict';
// Rijksmuseum adapter — license honesty: Rijksmuseum open images are CC0 per
// https://www.rijksmuseum.nl/en/rijksstudio. Attribution is not required,
// commercial use allowed. This applies to the collection images returned with
// webImage; individual third-party works may differ, so check the object page.
module.exports = {
  id: 'rijksmuseum',
  name: 'Rijksmuseum',
  website: 'https://www.rijksmuseum.nl/',
  type: 'museum',
  transport: 'api',
  docsUrl: 'https://data.rijksmuseum.nl/object-metadata/api/',
  endpointVerified: true,
  requiresKey: true,
  envKey: 'RIJKSMUSEUM_API_KEY',
  enabled: true,
  priority: 18,
  tags: ['museum', 'open-access', 'art', 'cc0', 'dutch'],
  categories: ['museum', 'open-access', 'art'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', licenseType: 'public-domain', attributionRequired: false, commercialUse: true, modificationAllowed: true, notes: 'Rijksmuseum open images are CC0 per Rijksstudio terms.' },
  async search(query, options, ctx) {
    const key = ctx.env('RIJKSMUSEUM_API_KEY');
    if (!key) throw new Error('rijksmuseum: API key missing — set RIJKSMUSEUM_API_KEY');
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({ key: key, q: query, ps: String(n), imgonly: 'true' });
    const res = await ctx.http.get('https://www.rijksmuseum.nl/api/nl/collection?' + params.toString());
    if (res.status !== 200) throw new Error('rijksmuseum: HTTP ' + res.status);
    const body = res.json();
    return (body && body.artObjects) || [];
  },
  mapResult(raw) {
    const webImage = raw.webImage || {};
    const links = raw.links || {};
    const out = {
      sourceId: raw.id,
      imageUrl: webImage.url,
      thumbnailUrl: webImage.url,
      sourceUrl: links.web,
      title: raw.title || undefined,
      description: raw.objectNumber || undefined,
      creator: raw.principalOrFirstMaker || undefined,
      width: webImage.width,
      height: webImage.height,
      license: 'CC0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attributionRequired: false,
      commercialUse: true,
      metadata: { plaqueDescription: raw.plaqueDescriptionEnglish || raw.plaqueDescriptionDutch, objectNumber: raw.objectNumber },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
