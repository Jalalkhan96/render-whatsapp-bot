'use strict';
// Remix Icon adapter — Apache 2.0 icons via npm package remixicon + jsDelivr.
// Layout is detected at runtime: the adapter collects EVERY .svg path in the
// published tree and matches the basename, instead of hard-coding a directory
// (the package layout has changed across versions, e.g. icons/<category>/<file>.svg).
// Fallback: if a future version nests differently, basename matching still applies.
// License honesty: Apache License 2.0 — commercial use allowed.
const PKG = 'remixicon';
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
  const m = path.match(/([^/]+)\.svg$/i);
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
    license: 'Apache License 2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    licenseType: 'apache-2.0',
    attributionRequired: false,
    commercialUse: true,
    modificationAllowed: true,
    metadata: { pkg: raw.pkg, version: raw.version, path: raw.path },
  };
}

module.exports = {
  id: 'remixicon',
  name: 'Remix Icon',
  website: 'https://remixicon.com/',
  type: 'icon',
  transport: 'package',
  docsUrl: 'https://data.jsdelivr.com/v1/packages/npm/remixicon',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 83,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: false, vectors: true, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'Apache License 2.0', licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0', licenseType: 'apache-2.0', attributionRequired: false, commercialUse: true, modificationAllowed: true, notes: 'Apache 2.0 per repo LICENSE; include license notice in redistributions.' },
  search,
  mapResult,
};
