'use strict';
// Pictogrammers / Material Design Icons adapter (jsDelivr npm package).
// License honesty: Apache License 2.0 — permissive, no attribution required,
// commercial use allowed. npm package is `@mdi/svg`; files: svg/<name>.svg,
// kebab-case (e.g. svg/account-check.svg).
const PKG = '@mdi/svg';

function flatten(files, prefix, out) {
  for (const f of files || []) {
    const p = prefix + '/' + f.name;
    if (f.type === 'directory') flatten(f.files, p, out);
    else if (/\.svg$/i.test(f.name)) out.push(p);
  }
}
function tokens(s) { return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

module.exports = {
  id: 'pictogrammers',
  name: 'Pictogrammers (MDI)',
  website: 'https://pictogrammers.com/',
  type: 'icon',
  transport: 'package',
  docsUrl: 'https://pictogrammers.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 80,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:false, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:30, delayMs:500, dailyLimit:null },
  defaultLicense: { license:'Apache License 2.0', licenseUrl:'https://www.apache.org/licenses/LICENSE-2.0', licenseType:'apache-2.0', attributionRequired:false, commercialUse:true, modificationAllowed:true, notes:'Material Design Icons by Pictogrammers contributors, Apache 2.0.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const r = await ctx.http.get('https://data.jsdelivr.com/v1/packages/npm/' + encodeURIComponent(PKG));
    if (r.status >= 400) throw new Error('HTTP ' + r.status + ' for jsdelivr package ' + PKG);
    const json = r.json();
    const version = json.version || 'latest';
    const paths = [];
    flatten(json.files, '', paths);
    const qt = new Set(tokens(query));
    const scored = [];
    for (const p of paths) {
      if (!/\/svg\//.test(p)) continue;
      const base = p.split('/').pop().replace(/\.svg$/i, '');
      const bt = tokens(base);
      const overlap = [...qt].filter(t => bt.some(b => b.includes(t) || t.includes(b))).length;
      if (overlap > 0) scored.push({ score: overlap, path: p, name: base });
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored.slice(0, limit).map(s => ({
      name: s.name,
      path: s.path,
      svgUrl: 'https://cdn.jsdelivr.net/npm/' + encodeURIComponent(PKG) + '@' + version + s.path,
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
      license: 'Apache License 2.0',
      licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
      licenseType: 'apache-2.0',
      attributionRequired: false,
      commercialUse: true,
      modificationAllowed: true,
      metadata: { pkg: raw.pkg, version: raw.version, path: raw.path },
    };
  },
};
