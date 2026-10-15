'use strict';
// NASA Image Library adapter — license honesty: NASA imagery is generally US
// public domain, but usage is bound by the NASA Usage Guidelines: trademarks
// must not be implied as endorsement, and images of identifiable persons need
// release for commercial use. commercialUse/attribution are therefore null.
// Detail fetch runs sequentially (cap 8) with per-item catch so one failure
// never aborts the whole result set.
module.exports = {
  id: 'nasa',
  name: 'NASA Image Library',
  website: 'https://images.nasa.gov/',
  type: 'photo',
  transport: 'api',
  docsUrl: 'https://images.nasa.gov/',
  endpointVerified: true,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 9,
  tags: ['space', 'science', 'public-domain', 'government'],
  categories: ['photo', 'space', 'science'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'NASA Usage Guidelines', licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/', licenseType: 'public-domain', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'US public domain generally; trademarks/endorsement and identifiable-persons restrictions apply.' },
  async search(query, options, ctx) {
    const n = Math.min((options && options.limit) || 10, 50);
    const res = await ctx.http.get('https://images-api.nasa.gov/search?q=' + encodeURIComponent(query) + '&media_type=image&page_size=' + n);
    if (res.status !== 200) throw new Error('nasa: HTTP ' + res.status);
    const items = (((res.json()).collection) || {}).items || [];
    const cap = Math.min(items.length, 8);
    const out = [];
    for (let i = 0; i < cap; i++) {
      const it = items[i] || {};
      const d = (it.data && it.data[0]) || {};
      const rec = {
        sourceId: d.nasa_id,
        title: d.title,
        description: d.description,
        creator: d.photographer,
        publishedAt: d.date_created,
        tags: d.keywords,
        thumbnailUrl: it.links && it.links[0] && it.links[0].href,
        sourceUrl: d.nasa_id ? 'https://images.nasa.gov/details/' + d.nasa_id : undefined,
        metadata: { center: d.center, usageGuidelinesUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/' },
      };
      try {
        if (d.nasa_id) {
          const a = await ctx.http.get('https://images-api.nasa.gov/asset/' + d.nasa_id);
          if (a.status === 200) {
            const ai = (a.json().collection || {}).items || [];
            if (ai[0] && ai[0].href) {
              const m = await ctx.http.get(ai[0].href);
              if (m.status === 200) {
                const files = m.json();
                const imgs = (Array.isArray(files) ? files : []).filter(function (h) { return /\.(jpe?g|png)$/i.test(h); });
                const pick = imgs.filter(function (h) { return /~orig/i.test(h); })[0] || imgs[0];
                if (pick) rec.imageUrl = pick;
              }
            }
          }
        }
      } catch (e) { ctx.log('nasa: detail fetch failed for', d.nasa_id, e.message); }
      out.push(rec);
    }
    return out;
  },
  mapResult(raw) {
    // search() already enriches records with detail fetch; here we just
    // prune empty fields into a partial universal object.
    const out = {
      sourceId: raw.sourceId, title: raw.title, description: raw.description,
      creator: raw.creator, publishedAt: raw.publishedAt, tags: raw.tags,
      imageUrl: raw.imageUrl, thumbnailUrl: raw.thumbnailUrl, sourceUrl: raw.sourceUrl,
      metadata: raw.metadata,
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
