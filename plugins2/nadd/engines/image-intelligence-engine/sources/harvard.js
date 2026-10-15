'use strict';
// Harvard Art Museums adapter — API key required (HARVARD_API_KEY). License honesty:
// license varies PER OBJECT — the copyright field is checked per record; only a
// copyright containing 'public domain' maps to Public Domain (licensePerImage).
// Everything else stays Unknown — never 'free'.
const API = 'https://api.harvardartmuseums.org';

module.exports = {
  id: 'harvard',
  name: 'Harvard Art Museums',
  website: 'https://harvardartmuseums.org/',
  type: 'museum',
  transport: 'api',
  docsUrl: 'https://harvardartmuseums.org/collections/api',
  endpointVerified: false,
  requiresKey: true,
  envKey: 'HARVARD_API_KEY',
  enabled: true,
  priority: 48,
  tags: ['museum', 'art', 'open-access'],
  categories: ['museum', 'art'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: false, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 1000, dailyLimit: null },
  defaultLicense: {
    license: 'Unknown (varies per object)',
    licenseUrl: 'https://harvardartmuseums.org/',
    licenseType: 'unknown',
    attributionRequired: null,
    commercialUse: null,
    modificationAllowed: null,
    notes: 'License varies per object (licensePerImage). mapResult maps a copyright field containing "public domain" to Public Domain; all other values stay Unknown.',
  },
  async search(query, options, ctx) {
    const key = ctx.env('HARVARD_API_KEY');
    if (!key) throw new Error('harvard: API key missing — set HARVARD_API_KEY');
    const limit = Math.min((options && options.limit) || 20, 50);
    const url = API + '/object?apikey=' + encodeURIComponent(key)
      + '&q=keyword:' + encodeURIComponent(query) + '&size=' + limit;
    const res = await ctx.http.get(url);
    if (res.status >= 400) throw new Error('harvard: HTTP ' + res.status + ' from API');
    const data = res.json();
    return Array.isArray(data.records) ? data.records : [];
  },
  mapResult(raw) {
    const out = {
      sourceId: raw.id != null ? String(raw.id) : undefined,
      title: raw.title || '',
      creator: (Array.isArray(raw.people) ? raw.people.map(p => p && p.name).filter(Boolean).join(', ') : ''),
      imageUrl: raw.primaryimageurl || '',
      sourceUrl: raw.url || '',
      publishedAt: raw.dated || '',
      description: raw.culture || '',
      metadata: { objectnumber: raw.objectnumber, division: raw.division, department: raw.department },
    };
    // licensePerImage: only assert Public Domain when the record says so.
    if (typeof raw.copyright === 'string' && /public domain/i.test(raw.copyright)) {
      out.license = 'Public Domain';
      out.licenseType = 'public-domain';
      out.attributionRequired = false;
      out.commercialUse = true;
      out.modificationAllowed = true;
    }
    // Otherwise license fields are omitted entirely (Unknown).
    return out;
  },
};
