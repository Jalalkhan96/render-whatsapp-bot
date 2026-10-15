'use strict';
// Internet Archive adapter — license honesty: license varies PER ITEM
// (see licensePerImage comment). licenseurl comes from item metadata when
// present; otherwise the license fields are omitted so the normalizer marks
// the item Unknown. Detail fetch runs sequentially (cap 5) with per-item
// catch so one failure never aborts the result set.
// licensePerImage: true
const IMG_RE = /\.(jpe?g|png|gif|webp)$/i;

module.exports = {
  id: 'internetarchive',
  name: 'Internet Archive',
  website: 'https://archive.org/',
  type: 'archive',
  transport: 'api',
  docsUrl: 'https://archive.org/services/docs/api/',
  endpointVerified: true,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 20,
  tags: ['archive', 'public-domain', 'history'],
  categories: ['archive', 'public-domain'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-item licenseurl from item metadata; Unknown when absent.' },
  async search(query, options, ctx) {
    const n = Math.min((options && options.limit) || 10, 50);
    const q = encodeURIComponent('(' + query + ') AND mediatype:image');
    const res = await ctx.http.get('https://archive.org/advancedsearch.php?q=' + q + '&fl[]=identifier,title,creator,date&rows=' + n + '&output=json');
    if (res.status !== 200) throw new Error('internetarchive: HTTP ' + res.status);
    const docs = (((res.json()).response) || {}).docs || [];
    const cap = Math.min(docs.length, 5);
    const out = [];
    for (let i = 0; i < cap; i++) {
      const doc = docs[i] || {};
      const rec = {
        sourceId: doc.identifier, title: doc.title, creator: doc.creator,
        publishedAt: doc.date, sourceUrl: doc.identifier ? 'https://archive.org/details/' + doc.identifier : undefined,
      };
      try {
        if (doc.identifier) {
          const m = await ctx.http.get('https://archive.org/metadata/' + doc.identifier);
          if (m.status === 200) {
            const meta = m.json() || {};
            const files = (meta.files || []).filter(function (f) { return f && IMG_RE.test(f.name) && !/_thumb/i.test(f.name); });
            const file = files[0];
            if (file) {
              rec.imageUrl = 'https://archive.org/download/' + doc.identifier + '/' + file.name;
              rec.filesize = file.size;
              const thumb = (meta.files || []).filter(function (f) { return f && /_thumb/i.test(f.name) && IMG_RE.test(f.name); })[0];
              rec.thumbnailUrl = 'https://archive.org/download/' + doc.identifier + '/' + (thumb ? thumb.name : file.name);
            }
            if (meta.metadata && meta.metadata.licenseurl) rec.licenseUrl = meta.metadata.licenseurl;
          }
        }
      } catch (e) { ctx.log('internetarchive: detail fetch failed for', doc.identifier, e.message); }
      out.push(rec);
    }
    return out;
  },
  mapResult(raw) {
    // search() already enriches records with detail fetch; map defensively.
    const out = {
      sourceId: raw.sourceId, title: raw.title, creator: raw.creator,
      publishedAt: raw.publishedAt, imageUrl: raw.imageUrl,
      thumbnailUrl: raw.thumbnailUrl, sourceUrl: raw.sourceUrl,
      filesize: raw.filesize, licenseUrl: raw.licenseUrl,
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
