'use strict';
// The Met Open Access adapter — license honesty: only works flagged
// isPublicDomain=true are CC0; anything else keeps license Unknown (omitted)
// so the normalizer marks it Unknown. Object fetches run sequentially
// (cap 8) with per-item catch so one failure never aborts the result set.
module.exports = {
  id: 'met',
  name: 'The Met Open Access',
  website: 'https://www.metmuseum.org/',
  type: 'museum',
  transport: 'api',
  docsUrl: 'https://metmuseum.github.io/',
  endpointVerified: true,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 15,
  tags: ['museum', 'open-access', 'art', 'cc0'],
  categories: ['museum', 'open-access', 'art'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'CC0 only for isPublicDomain works; otherwise Unknown.' },
  async search(query, options, ctx) {
    const res = await ctx.http.get('https://collectionapi.metmuseum.org/public/collection/v1/search?q=' + encodeURIComponent(query));
    if (res.status !== 200) throw new Error('met: HTTP ' + res.status);
    const ids = (((res.json()).objectIDs) || []).slice(0, 8);
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      try {
        const d = await ctx.http.get('https://collectionapi.metmuseum.org/public/collection/v1/objects/' + ids[i]);
        if (d.status === 200) out.push(d.json());
      } catch (e) { ctx.log('met: detail fetch failed for', ids[i], e.message); }
    }
    return out;
  },
  mapResult(raw) {
    // search() already fetches full object records; map them defensively.
    const cc0 = raw.isPublicDomain === true;
    const out = {
      sourceId: raw.objectID,
      imageUrl: raw.primaryImage || undefined,
      thumbnailUrl: raw.primaryImageSmall || undefined,
      sourceUrl: raw.objectURL,
      title: raw.title || undefined,
      description: [raw.medium, raw.department].filter(Boolean).join(' — ') || undefined,
      creator: raw.artistDisplayName || undefined,
      creatorUrl: undefined,
      publishedAt: raw.objectDate || undefined,
      license: cc0 ? 'CC0' : undefined,
      licenseUrl: cc0 ? 'https://creativecommons.org/publicdomain/zero/1.0/' : undefined,
      attributionRequired: cc0 ? false : undefined,
      metadata: { objectID: raw.objectID, department: raw.department, culture: raw.culture },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
