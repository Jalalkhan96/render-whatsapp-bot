'use strict';
// Heroicons adapter (jsDelivr npm package). License honesty: MIT — a real
// permissive grant (no attribution required, commercial use allowed).
// Files: 24/outline/<name>.svg and 24/solid/<name>.svg, kebab-case names.
// Outline is preferred in scoring; both variants are returned for matches.
const PKG = 'heroicons';

function flatten(files, prefix, out) {
  for (const f of files || []) {
    const p = prefix + '/' + f.name;
    if (f.type === 'directory') flatten(f.files, p, out);
    else if (/\.svg$/i.test(f.name)) out.push(p);
  }
}
function tokens(s) { return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

module.exports = {
  id: 'heroicons',
  name: 'Heroicons',
  website: 'https://heroicons.com/',
  type: 'icon',
  transport: 'package',
  docsUrl: 'https://heroicons.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 74,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:false, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:30, delayMs:500, dailyLimit:null },
  defaultLicense: { license:'MIT', licenseUrl:'https://github.com/tailwindlabs/heroicons/blob/master/LICENSE', licenseType:'mit', attributionRequired:false, commercialUse:true, modificationAllowed:true, notes:'MIT licensed; include the license notice when redistributing.' },

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
      const mm = p.match(/\/(24|20|16)\/(outline|solid|mini)\/([^/]+)\.svg$/i);
      if (!mm) continue;
      const base = mm[3].toLowerCase();
      const bt = tokens(base);
      const overlap = [...qt].filter(t => bt.some(b => b.includes(t) || t.includes(b))).length;
      if (overlap === 0) continue;
      const score = overlap + (mm[2].toLowerCase() === 'outline' ? 0.5 : 0); // prefer outline
      scored.push({ score, path: p, name: mm[3], variant: mm[2].toLowerCase() });
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored.slice(0, limit).map(s => ({
      name: s.name,
      path: s.path,
      svgUrl: 'https://cdn.jsdelivr.net/npm/' + PKG + '@' + version + s.path,
      version,
      pkg: PKG,
      variant: s.variant,
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
      license: 'MIT',
      licenseUrl: 'https://github.com/tailwindlabs/heroicons/blob/master/LICENSE',
      licenseType: 'mit',
      attributionRequired: false,
      commercialUse: true,
      modificationAllowed: true,
      metadata: { pkg: raw.pkg, version: raw.version, path: raw.path, variant: raw.variant || null },
    };
  },
};
