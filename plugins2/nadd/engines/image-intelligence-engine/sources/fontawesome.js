'use strict';
// Font Awesome Free adapter (jsDelivr npm package). License honesty: the
// FREE icon set is licensed CC BY 4.0 — attribution REQUIRED; commercial use
// allowed. This covers ONLY the free set (@fortawesome/fontawesome-free);
// Pro icons are not included. Files: svgs/solid|regular|brands/<name>.svg,
// kebab-case. All three dirs are searched.
const PKG = '@fortawesome/fontawesome-free';
const DIRS = ['solid', 'regular', 'brands'];

function flatten(files, prefix, out) {
  for (const f of files || []) {
    const p = prefix + '/' + f.name;
    if (f.type === 'directory') flatten(f.files, p, out);
    else if (/\.svg$/i.test(f.name)) out.push(p);
  }
}
function tokens(s) { return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }

module.exports = {
  id: 'fontawesome',
  name: 'Font Awesome',
  website: 'https://fontawesome.com/',
  type: 'icon',
  transport: 'package',
  docsUrl: 'https://fontawesome.com/license/free',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 78,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:false, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:30, delayMs:500, dailyLimit:null },
  defaultLicense: { license:'CC BY 4.0 (Free set)', licenseUrl:'https://fontawesome.com/license/free', licenseType:'cc-by-4.0', attributionRequired:true, commercialUse:true, modificationAllowed:true, notes:'Free icon set only (CC BY 4.0); attribution required. Pro icons NOT covered by this adapter.' },

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
      const mm = p.match(/\/svgs\/(solid|regular|brands)\/([^/]+)\.svg$/i);
      if (!mm || !DIRS.includes(mm[1].toLowerCase())) continue;
      const base = mm[2].toLowerCase();
      const bt = tokens(base);
      const overlap = [...qt].filter(t => bt.some(b => b.includes(t) || t.includes(b))).length;
      if (overlap > 0) scored.push({ score: overlap, path: p, name: mm[2], style: mm[1].toLowerCase() });
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored.slice(0, limit).map(s => ({
      name: s.name,
      path: s.path,
      svgUrl: 'https://cdn.jsdelivr.net/npm/' + encodeURIComponent(PKG) + '@' + version + s.path,
      version,
      pkg: PKG,
      style: s.style,
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
      license: 'CC BY 4.0 (Free set)',
      licenseUrl: 'https://fontawesome.com/license/free',
      licenseType: 'cc-by-4.0',
      attributionRequired: true,
      commercialUse: true,
      modificationAllowed: true,
      metadata: { pkg: raw.pkg, version: raw.version, path: raw.path, style: raw.style || null },
    };
  },
};
