'use strict';
// Wikimedia Commons adapter — license honesty: license varies PER IMAGE
// (see licensePerImage comment). License fields are only set when the API
// actually returns them; otherwise the normalizer marks them Unknown.
// licensePerImage: true
const { cleanText } = require('../lib/scrape.js');

module.exports = {
  id: 'wikimedia',
  name: 'Wikimedia Commons',
  website: 'https://commons.wikimedia.org/',
  type: 'photo',
  transport: 'api',
  docsUrl: 'https://commons.wikimedia.org/wiki/API:Main_page',
  endpointVerified: true,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 5,
  tags: ['cc', 'public-domain', 'commons', 'archive'],
  categories: ['photo', 'public-domain', 'archive'],
  capabilities: { search: true, metadata: true, download: true, api: true, publicPage: true, vectors: false, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 60, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'Unknown', licenseUrl: '', licenseType: 'unknown', attributionRequired: null, commercialUse: null, modificationAllowed: null, notes: 'Per-image license from Commons metadata; verify on the file page.' },
  async search(query, options, ctx) {
    const n = Math.min((options && options.limit) || 10, 50);
    const gsr = encodeURIComponent(query + ' filetype:bitmap');
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search' +
      '&gsrsearch=' + gsr + '&gsrnamespace=6&gsrlimit=' + n +
      '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=800';
    const res = await ctx.http.get(url);
    if (res.status !== 200) throw new Error('wikimedia: HTTP ' + res.status);
    const body = res.json();
    const pages = (body && body.query && body.query.pages) || {};
    return Object.keys(pages).map(function (k) { return pages[k]; });
  },
  mapResult(raw) {
    const ii = (raw.imageinfo && raw.imageinfo[0]) || {};
    const em = ii.extmetadata || {};
    const val = function (f) { return f && f.value ? cleanText(f.value) : undefined; };
    const title = typeof raw.title === 'string' ? raw.title.replace(/^File:/, '') : undefined;
    const out = {
      sourceId: raw.pageid,
      imageUrl: ii.url,
      thumbnailUrl: ii.thumburl || ii.url,
      sourceUrl: raw.title ? 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(raw.title) : undefined,
      title: title,
      description: val(em.ImageDescription),
      creator: val(em.Artist),
      width: ii.width,
      height: ii.height,
      filesize: ii.size,
      license: em.LicenseShortName && em.LicenseShortName.value ? val(em.LicenseShortName) : undefined,
      licenseUrl: em.LicenseUrl && em.LicenseUrl.value ? em.LicenseUrl.value : undefined,
      publishedAt: val(em.DateTime),
      metadata: { mediaType: ii.mediatype, mime: ii.mime },
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  },
};
