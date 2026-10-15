'use strict';
// Twemoji adapter (jsDelivr npm package). License honesty: CC BY 4.0 —
// attribution REQUIRED; commercial use allowed. Files: 2/svg/<code>.svg
// (lowercase hex, hyphen-separated for ZWJ sequences, e.g. 2/svg/1f600.svg).
// LIMITATION: the package contains no name index — only codepoints — so we
// match ONLY when the query itself looks like a hex codepoint
// (/^[0-9a-f-]+$/i). Anything else returns [] by design.
const PKG = 'twemoji';

function flatten(files, prefix, out) {
  for (const f of files || []) {
    const p = prefix + '/' + f.name;
    if (f.type === 'directory') flatten(f.files, p, out);
    else if (/\.svg$/i.test(f.name)) out.push(p);
  }
}

module.exports = {
  id: 'twemoji',
  name: 'Twemoji',
  website: 'https://twemoji.twitter.com/',
  type: 'icon',
  transport: 'package',
  docsUrl: 'https://twemoji.twitter.com/',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 73,
  tags: ['icon', 'emoji'],
  categories: ['icon', 'emoji'],
  capabilities: { search:true, metadata:true, download:true, api:false, publicPage:false, vectors:true, illustrations:false, wallpapers:false, licenseMetadata:true },
  rateLimit: { requestsPerMinute:30, delayMs:500, dailyLimit:null },
  defaultLicense: { license:'CC BY 4.0', licenseUrl:'https://creativecommons.org/licenses/by/4.0/', licenseType:'cc-by-4.0', attributionRequired:true, commercialUse:true, modificationAllowed:true, notes:'Attribution required.' },

  async search(query, options, ctx) {
    const limit = Math.min(50, (options && options.limit) || 20);
    const code = query.trim().toLowerCase();
    // No name index in the package: only codepoint queries are matchable.
    if (!/^[0-9a-f-]+$/.test(code)) return [];
    const r = await ctx.http.get('https://data.jsdelivr.com/v1/packages/npm/' + encodeURIComponent(PKG));
    if (r.status >= 400) throw new Error('HTTP ' + r.status + ' for jsdelivr package ' + PKG);
    const json = r.json();
    const version = json.version || 'latest';
    const paths = [];
    flatten(json.files, '', paths);
    const target = '/2/svg/' + code + '.svg';
    const hit = paths.find(p => p.toLowerCase() === target);
    if (!hit) return [];
    const name = code;
    return [{ name, path: hit, svgUrl: 'https://cdn.jsdelivr.net/npm/' + PKG + '@' + version + hit, version, pkg: PKG }].slice(0, limit);
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
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      licenseType: 'cc-by-4.0',
      attributionRequired: true,
      commercialUse: true,
      modificationAllowed: true,
      metadata: { pkg: raw.pkg, version: raw.version, path: raw.path, note: 'codepoint-only search: no name index in package' },
    };
  },
};
