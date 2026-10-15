'use strict';
// Boxicons adapter — icons via npm package boxicons + jsDelivr.
// Layout: svg/regular/bx-<name>.svg and svg/solid/bx-<name>.svg, verified at
// runtime. Query matches the icon name with AND without the bx- prefix.
// License honesty: the free set is CC BY 4.0 — attribution IS required
// (verify against the repo before redistributing; flagged in notes).
const PKG = 'boxicons';
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
  const m = path.match(/^svg\/(regular|solid)\/bx-([a-z0-9-]+)\.svg$/i);
  return m ? { name: m[2], style: m[1].toLowerCase() } : null;
}

function matchScore(name, query) {
  const qt = tokens(query);
  if (!qt.length) return 0;
  let best = -1;
  // Match against the name with and without the bx- prefix, per spec.
  for (const bt of [tokens(name), tokens('bx-' + name)]) {
    const overlap = qt.filter((t) => bt.some((b) => b === t || b.indexOf(t) === 0 || t.indexOf(b) === 0)).length;
    if (overlap > best) best = overlap;
  }
  return best > 0 ? best : -1;
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
    const pick = pickName(p);
    if (!pick) continue;
    const score = matchScore(pick.name, query);
    if (score >= 0) scored.push({ score, name: pick.name, path: p, style: pick.style });
  }
  scored.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
  return scored.slice(0, limit).map((s) => ({
    name: s.name, path: s.path, svgUrl: CDN + version + s.path, version, pkg: PKG, style: s.style,
  }));
}

function mapResult(raw) {
  raw = raw || {};
  const display = 'bx-' + raw.name;
  return {
    sourceId: display,
    imageUrl: raw.svgUrl,
    thumbnailUrl: raw.svgUrl,
    downloadUrl: raw.svgUrl,
    sourceUrl: 'https://www.jsdelivr.com/package/npm/' + PKG,
    title: display,
    format: 'svg',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    licenseType: 'cc-by-4.0',
    attributionRequired: true,
    commercialUse: true,
    modificationAllowed: true,
    metadata: { pkg: raw.pkg, version: raw.version, path: raw.path, style: raw.style },
  };
}

module.exports = {
  id: 'boxicons',
  name: 'Boxicons',
  website: 'https://boxicons.com/',
  type: 'icon',
  transport: 'package',
  docsUrl: 'https://data.jsdelivr.com/v1/packages/npm/boxicons',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 90,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: false, vectors: true, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', licenseType: 'cc-by-4.0', attributionRequired: true, commercialUse: true, modificationAllowed: true, notes: 'verify: Boxicons free set is CC BY 4.0 — attribution required when used.' },
  search,
  mapResult,
};
