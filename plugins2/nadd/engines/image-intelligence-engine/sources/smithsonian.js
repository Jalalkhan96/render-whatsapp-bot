'use strict';
// Smithsonian Open Access adapter — license honesty: rights vary PER OBJECT
// (see licensePerImage comment). Many Smithsonian records are metadata-only
// (metadataAvailable) with no media file (mediaAvailable); imageUrl is
// omitted in that case. Always check the rights statement on the object page.
// licensePerImage: true
module.exports = {
  id: 'smithsonian',
  name: 'Smithsonian Open Access',
  website: 'https://www.si.edu/',
  type: 'museum',
  transport: 'api',
  docsUrl: 'https://api.si.edu/openaccess/devtools/docs/',
  endpointVerified: true,
  requiresKey: true,
  envKey: 'SMITHSONIAN_API_KEY',
  enabled: true,
  priority: 10,
  tags: ['museum', 'open-access', 'smithsonian'],
  categories: ['museum', 'open-access'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 1000, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-object rights; distinguish metadataAvailable from mediaAvailable.' },
  async search(query, options, ctx) {
    const key = ctx.env('SMITHSONIAN_API_KEY');
    if (!key) throw new Error('smithsonian: API key missing — set SMITHSONIAN_API_KEY');
    const n = Math.min((options && options.limit) || 10, 50);
    const params = new URLSearchParams({ q: query, api_key: key, rows: String(n) });
    const res = await ctx.http.get('https://api.si.edu/openaccess/api/v1.0/search?' + params.toString());
    if (res.status !== 200) throw new Error('smithsonian: HTTP ' + res.status);
    const body = res.json();
    return ((body.response && body.response.rows) || body.rows || []);
  },
  mapResult(raw) {
    const content = raw.content || {};
    const dnr = content.descriptiveNonRepeating || {};
    const online = dnr.online_media || {};
    const media = (online.media && online.media[0]) || {};
    const notes = raw.freetext && raw.freetext.notes;
    const creators = (content.indexedStructured && content.indexedStructured.creator) || [];
    const dates = (content.indexedStructured && content.indexedStructured.date) || [];
    const out = {
      sourceId: raw.id,
      imageUrl: media.thumbnail || media.guid || undefined,
      thumbnailUrl: media.thumbnail || undefined,
      sourceUrl: raw.id ? 'https://www.si.edu/search/collection-images?edanmdm=' + raw.id : undefined,
      title: raw.title || dnr.title || undefined,
      description: notes && notes[0] && notes[0].content,
      creator: creators.length ? creators.join(', ') : undefined,
      publishedAt: dates[0] || undefined,
      metadata: {
        metadataAvailable: !!content,
        mediaAvailable: (online.mediaCount || 0) > 0,
        department: raw.unitCode || (dnr.data_source && dnr.data_source[0]),
        mediaType: media.type,
      },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
