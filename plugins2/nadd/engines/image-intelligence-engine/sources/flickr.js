'use strict';
// Flickr adapter — license honesty: license varies PER IMAGE
// (see licensePerImage comment). Only CC0 (9), Public Domain Mark (10) and
// "No known copyright restrictions" (7) are reuse-friendly; the license id
// map below is best-effort and should be verified on the photo page.
// licensePerImage: true
const FLICKR_LICENSES = { 4: 'CC BY', 5: 'CC BY-SA', 6: 'CC BY-ND', 7: 'No known copyright restrictions', 9: 'CC0', 10: 'Public Domain Mark' };

module.exports = {
  id: 'flickr',
  name: 'Flickr',
  website: 'https://www.flickr.com/',
  type: 'photo',
  transport: 'api',
  docsUrl: 'https://www.flickr.com/services/api/',
  endpointVerified: true,
  requiresKey: true,
  envKey: 'FLICKR_API_KEY',
  enabled: true,
  priority: 8,
  tags: ['cc', 'photography', 'community'],
  categories: ['photo', 'cc'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-image license; only CC0 / Public Domain Mark / no-known-restrictions are reuse-friendly.' },
  async search(query, options, ctx) {
    const key = ctx.env('FLICKR_API_KEY');
    if (!key) throw new Error('flickr: API key missing — set FLICKR_API_KEY');
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({
      method: 'flickr.photos.search', api_key: key, text: query, per_page: String(n),
      license: '4,5,6,7,9,10', extras: 'url_m,url_l,url_sq,owner_name,license,date_taken,tags',
      format: 'json', nojsoncallback: '1',
    });
    const res = await ctx.http.get('https://www.flickr.com/services/rest/?' + params.toString());
    if (res.status !== 200) throw new Error('flickr: HTTP ' + res.status);
    const body = res.json();
    if (body.stat !== 'ok') throw new Error('flickr: API error ' + (body.message || body.stat));
    return ((body.photos && body.photos.photo) || []);
  },
  mapResult(raw) {
    const license = FLICKR_LICENSES[String(raw.license)];
    const out = {
      sourceId: raw.id,
      imageUrl: raw.url_l || raw.url_m,
      thumbnailUrl: raw.url_sq || raw.url_m,
      sourceUrl: raw.owner ? 'https://www.flickr.com/photos/' + raw.owner + '/' + raw.id : undefined,
      title: raw.title || undefined,
      creator: raw.ownername,
      creatorUrl: raw.owner ? 'https://www.flickr.com/people/' + raw.owner : undefined,
      width: raw.width_l || raw.width_m,
      height: raw.height_l || raw.height_m,
      license: license,
      licenseUrl: undefined,
      attributionRequired: license === 'CC BY' || license === 'CC BY-SA' || license === 'CC BY-ND' ? true : undefined,
      tags: typeof raw.tags === 'string' ? raw.tags.split(' ').filter(Boolean) : undefined,
      publishedAt: raw.datetaken || undefined,
      metadata: { licenseId: raw.license },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
