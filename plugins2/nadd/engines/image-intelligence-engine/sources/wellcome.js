'use strict';
// Wellcome Collection adapter — no key required. License honesty: default Unknown.
// Rights vary per work, so verify on the work page before reuse; license fields
// are therefore omitted in mapResult (never 'free').
const API = 'https://api.wellcomecollection.org/catalogue/v2/images';
const WORK = 'https://wellcomecollection.org/works/';

module.exports = {
  id: 'wellcome',
  name: 'Wellcome Collection',
  website: 'https://wellcomecollection.org/',
  type: 'archive',
  transport: 'api',
  docsUrl: 'https://developers.wellcomecollection.org/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 43,
  tags: ['archive', 'science', 'medical-history'],
  categories: ['archive', 'science'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 1000, dailyLimit: null },
  defaultLicense: {
    license: 'Unknown (verify per work)',
    licenseUrl: 'https://wellcomecollection.org/',
    licenseType: 'unknown',
    attributionRequired: null,
    commercialUse: null,
    modificationAllowed: null,
    notes: 'Rights vary per work; check the sourceUrl work page before reuse. The API thumbnail is used as imageUrl; fetch the full image from the work page if needed.',
  },
  async search(query, options, ctx) {
    const limit = Math.min((options && options.limit) || 20, 50);
    const url = API + '?query=' + encodeURIComponent(query);
    const res = await ctx.http.get(url);
    if (res.status >= 400) throw new Error('wellcome: HTTP ' + res.status + ' from API');
    const data = res.json();
    // Defensive: accept the documented shape and plain-array fallbacks.
    const results = Array.isArray(data.results) ? data.results
      : Array.isArray(data) ? data : [];
    return results.slice(0, limit);
  },
  mapResult(raw) {
    const src = (raw && raw.source) || {};
    const thumb = (raw && raw.thumbnail && raw.thumbnail.url) || '';
    const workId = src.id != null ? String(src.id) : '';
    return {
      sourceId: raw.id != null ? String(raw.id) : undefined,
      title: src.title || raw.title || '',
      imageUrl: thumb,
      thumbnailUrl: thumb,
      sourceUrl: workId ? WORK + workId : undefined,
      metadata: {
        aspectRatio: raw.aspectRatio,
        workType: raw.workType,
        physicalDescription: src.physicalDescription,
      },
    };
    // license fields intentionally omitted — unknown per work.
  },
};
