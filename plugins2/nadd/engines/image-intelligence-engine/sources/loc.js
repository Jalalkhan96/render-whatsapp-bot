'use strict';
// Library of Congress adapter — license honesty: rights vary PER ITEM
// (see licensePerImage comment). license:'Public Domain' is set ONLY when
// rights_advisory explicitly contains "public domain"; everything else stays
// Unknown so the normalizer flags it for review.
// licensePerImage: true
module.exports = {
  id: 'loc',
  name: 'Library of Congress',
  website: 'https://www.loc.gov/',
  type: 'archive',
  transport: 'api',
  docsUrl: 'https://www.loc.gov/apis/',
  endpointVerified: true,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 12,
  tags: ['archive', 'public-domain', 'library', 'history'],
  categories: ['archive', 'public-domain'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-item rights_advisory; "Public Domain" only when the advisory says so explicitly.' },
  async search(query, options, ctx) {
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({ q: query, fo: 'json', c: String(n) });
    const res = await ctx.http.get('https://www.loc.gov/photos/?' + params.toString());
    if (res.status !== 200) throw new Error('loc: HTTP ' + res.status);
    const body = res.json();
    return (body && body.results) || [];
  },
  mapResult(raw) {
    const item = raw.item || {};
    const rights = Array.isArray(item.rights_advisory) ? item.rights_advisory.join('; ') : (item.rights_advisory || '');
    const isPD = /public domain/i.test(rights);
    const out = {
      sourceId: raw.id,
      imageUrl: Array.isArray(item.image_url) ? item.image_url[0] : undefined,
      thumbnailUrl: Array.isArray(item.image_url) ? item.image_url[0] : undefined,
      sourceUrl: item.url || raw.url,
      title: item.title,
      description: Array.isArray(item.notes) ? item.notes.join(' ') : undefined,
      creator: Array.isArray(item.contributor) ? item.contributor.join(', ') : undefined,
      publishedAt: Array.isArray(item.date) ? item.date.join('; ') : item.date,
      tags: item.subject || undefined,
      license: isPD ? 'Public Domain' : undefined,
      metadata: { rights_advisory: rights || undefined },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
