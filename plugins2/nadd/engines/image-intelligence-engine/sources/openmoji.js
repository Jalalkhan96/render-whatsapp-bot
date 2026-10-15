'use strict';
// OpenMoji adapter (jsDelivr npm package). License honesty: CC BY-SA 4.0 —
// attribution REQUIRED and ShareAlike applies; commercial use allowed.
// Files: color/svg/<CODE>.svg where CODE is an UPPERCASE hex codepoint
// (e.g. color/svg/1F600.svg). Name-based search is limited: codepoints do not
// map to English names in the package, so we match query tokens against the
// basename, plus a direct hex-codepoint match.
const PKG = 'openmoji';

function flatten(files, prefix, out) {
  for (const f of files || []) {
    const p = prefix + '/' + f.name;
    if (f.type === 'directory') flatten(f.files, p, out);
    else if (/\.svg$/i.test(f.name)) out.push(p);
  }
}
function tokens(s) { return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

module.exports = {
  id: 'openmoji',
  name: 'OpenMoji',
  website: 'https://openmoji.org/',
  type: 'icon',
  transport: 'package',
  docsUrl: 'https://openmoji.org/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 72,
  tags: ['icon', 'emoji'],
  categories: ['icon', 'emoji'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:false, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:30, delayMs:500, dailyLimit:null },
  defaultLicense: { license:'CC BY-SA 4.0', licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/', licenseType:'cc-by-sa-4.0', attributionRequired:true, commercialUse:true, modificationAllowed:true, notes:'Attribution required; ShareAlike applies to derivatives.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const r = await ctx.http.get('https://data.jsdelivr.com/v1/packages/npm/' + encodeURIComponent(PKG));
    if (r.status >= 400) throw new Error('HTTP ' + r.status + ' for jsdelivr package ' + PKG);
    const json = r.json();
    const version = json.version || 'latest';
    const paths = [];
    flatten(json.files, '', paths);
    const qt = new Set(tokens(query));
    const isCodepoint = /^[0-9a-fA-F]+$/.test(query.trim());
    const scored = [];
    for (const p of paths) {
      if (!/\/color\/svg\//i.test(p)) continue;
      const base = p.split('/').pop().replace(/\.svg$/i, '');
      const bl = base.toLowerCase();
      const overlap = [...qt].filter(t => bl.includes(t)).length;
      const codeMatch = isCodepoint && bl === query.trim().toLowerCase();
      const score = overlap + (codeMatch ? 10 : 0);
      if (score > 0) scored.push({ score, path: p, name: base });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => ({
      name: s.name,
      path: s.path,
      svgUrl: 'https://cdn.jsdelivr.net/npm/' + PKG + '@' + version + s.path,
      version,
      pkg: PKG,
    }));
  },

  mapResult(raw) {
    return {
      sourceId: raw.name,
      title: raw.name,
      imageUrl: raw.svgUrl,
      thumbnailUrl: raw.svgUrl,
      downloadUrl: raw.svgUrl,
      format: 'svg',
      sourceUrl: 'https://www.jsdelivr.com/package/npm/' + raw.pkg,
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      licenseType: 'cc-by-sa-4.0',
      attributionRequired: true,
      commercialUse: true,
      modificationAllowed: true,
      metadata: { pkg: raw.pkg, version: raw.version, path: raw.path, note: 'name-based search limited: codepoints have no English names in the package' },
    };
  },
};
