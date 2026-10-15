'use strict';
// Art Institute of Chicago adapter — license honesty: only works flagged
// is_public_domain=true are CC0; anything else keeps license Unknown
// (omitted) so the normalizer marks it Unknown. CC0 is NOT claimed for
// non-public-domain works. Image URLs use the IIIF image API pattern.
module.exports = {
  id: 'aic',
  name: 'Art Institute of Chicago',
  website: 'https://www.artic.edu/',
  type: 'museum',
  transport: 'api',
  docsUrl: 'https://api.artic.edu/docs/',
  endpointVerified: true,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 16,
  tags: ['museum', 'open-access', 'art', 'cc0'],
  categories: ['museum', 'open-access', 'art'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'CC0 only for public-domain works; otherwise Unknown.' },
  async search(query, options, ctx) {
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({
      q: query, limit: String(n),
      fields: 'id,title,artist_title,date_display,medium_display,department_title,image_id,thumbnail,is_public_domain',
    });
    const res = await ctx.http.get('https://api.artic.edu/api/v1/artworks/search?' + params.toString());
    if (res.status !== 200) throw new Error('aic: HTTP ' + res.status);
    const body = res.json();
    return (body && body.data) || [];
  },
  mapResult(raw) {
    const cc0 = raw.is_public_domain === true;
    const out = {
      sourceId: raw.id,
      imageUrl: raw.image_id ? 'https://www.artic.edu/iiif/2/' + raw.image_id + '/full/843,/0/default.jpg' : undefined,
      thumbnailUrl: raw.thumbnail && raw.thumbnail.lqip ? raw.thumbnail.lqip : undefined,
      sourceUrl: raw.id ? 'https://www.artic.edu/artworks/' + raw.id : undefined,
      title: raw.title || undefined,
      description: [raw.medium_display, raw.department_title].filter(Boolean).join(' — ') || undefined,
      creator: raw.artist_title || undefined,
      publishedAt: raw.date_display || undefined,
      license: cc0 ? 'CC0' : undefined,
      licenseUrl: cc0 ? 'https://creativecommons.org/publicdomain/zero/1.0/' : undefined,
      attributionRequired: cc0 ? false : undefined,
      metadata: { altText: raw.thumbnail && raw.thumbnail.alt_text },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
