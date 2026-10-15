'use strict';
// Maki Icons adapter — map pin icons via npm @mapbox/maki + jsDelivr.
// Layout: icons/<name>.svg, kebab-case basenames, verified at runtime.
// License honesty: CC0 1.0 — commercial use allowed, no attribution required.
const PKG = '@mapbox/maki';
const BASE = 'https://data.jsdelivr.com/v1/packages/npm/' + PKG;
const CDN = 'https://cdn.jsdelivr.net/npm/' + PKG + '@';

function flatten(files, out) {
  for (const f of files || []) {
    if (!f) continue;
    if (f.type === 'directory' && Array.isArray(f.files)) flatten(f.files, out);
    else if (typeof f.name === 'string') out.push(f.name);
  }
}

function tokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function pickName(path) {
  const m = path.match(/^icons\/([a-z0-9-]+)\.svg$/i);
  return m ? m[1] : null;
}

function matchScore(name, query) {
  const qt = tokens(query);
  if (!qt.length) return 0;
  const bt = tokens(name);
  const overlap = qt.filter((t) => bt.some((b) => b === t || b.indexOf(t) === 0 || t.indexOf(b) === 0)).length;
  return overlap > 0 ? overlap : -1;
}

async function search(query, options, ctx) {
  const limit = Math.min(Math.max(parseInt((options && options.limit) || 20, 10) || 20, 1), 50);
  const r = await ctx.http.get(BASE, { timeout: 20000 });
  if (r.status >= 400) throw new Error(`HTTP ${r.status} for ${BASE}`);
  const json = r.json();
  let files = json.files;
  let version = json.version || 'latest';
  if (!files && Array.isArray(json.versions) && json.versions.length) {
    // Bare package endpoint returns metadata only; resolve the file tree via
    // the versioned endpoint. Unverified shape fallback, documented here.
    const v = json.versions[0].version || (json.tags && json.tags.latest) || 'latest';
    const treeUrl = BASE + '@' + v;
    const r2 = await ctx.http.get(treeUrl, { timeout: 20000 });
    if (r2.status >= 400) throw new Error(`HTTP ${r2.status} for ${treeUrl}`);
    const j2 = r2.json();
    files = j2.files;
    version = j2.version || v;
  }
  if (!files) throw new Error(`Unexpected jsDelivr response shape for ${PKG}`);
  const paths = [];
  flatten(files, paths);
  const scored = [];
  for (const p of paths) {
    if (!/\.svg$/i.test(p)) continue;
    const name = pickName(p);
    if (!name) continue;
    const score = matchScore(name, query);
    if (score >= 0) scored.push({ score, name, path: p });
  }
  scored.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
  return scored.slice(0, limit).map((s) => ({
    name: s.name, path: s.path, svgUrl: CDN + version + s.path, version, pkg: PKG,
  }));
}

function mapResult(raw) {
  raw = raw || {};
  return {
    sourceId: raw.name,
    imageUrl: raw.svgUrl,
    thumbnailUrl: raw.svgUrl,
    downloadUrl: raw.svgUrl,
    sourceUrl: 'https://www.jsdelivr.com/package/npm/' + PKG,
    title: raw.name,
    format: 'svg',
    license: 'CC0 1.0 Universal',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    licenseType: 'cc0',
    attributionRequired: false,
    commercialUse: true,
    modificationAllowed: true,
    metadata: { pkg: raw.pkg, version: raw.version, path: raw.path },
  };
}

module.exports = {
  id: 'maki',
  name: 'Maki Icons',
  website: 'https://labs.mapbox.com/maki-icons/',
  type: 'icon',
  transport: 'package',
  docsUrl: 'https://data.jsdelivr.com/v1/packages/npm/@mapbox/maki',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 91,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: false, vectors: true, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'CC0 1.0 Universal', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', licenseType: 'cc0', attributionRequired: false, commercialUse: true, modificationAllowed: true, notes: 'Maki icons are CC0 — no attribution required, commercial use allowed.' },
  search,
  mapResult,
};
