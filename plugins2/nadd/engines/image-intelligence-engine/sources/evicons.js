'use strict';
// Eva Icons adapter — MIT icons via npm package eva-icons + jsDelivr.
// Layout is verified at runtime: tries fill/svg/<name>.svg first, then
// outline/svg/<name>.svg, then any .svg basename match. When the same icon
// exists in both styles, the fill variant wins; the style is reported in
// metadata. License honesty: MIT per repo LICENSE.
const PKG = 'eva-icons';
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
  let m = path.match(/^fill\/svg\/([a-z0-9-]+)\.svg$/i);
  if (m) return { name: m[1], style: 'fill', rank: 0 };
  m = path.match(/^outline\/svg\/([a-z0-9-]+)\.svg$/i);
  if (m) return { name: m[1], style: 'outline', rank: 1 };
  m = path.match(/\/([a-z0-9-]+)\.svg$/i);
  return m ? { name: m[1], style: 'unknown', rank: 2 } : null;
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
  const byName = new Map();
  for (const p of paths) {
    if (!/\.svg$/i.test(p)) continue;
    const pick = pickName(p);
    if (!pick) continue;
    const score = matchScore(pick.name, query);
    if (score < 0) continue;
    const cur = byName.get(pick.name);
    if (!cur || pick.rank < cur.rank) {
      byName.set(pick.name, { score, name: pick.name, path: p, rank: pick.rank, style: pick.style });
    }
  }
  const scored = [...byName.values()];
  scored.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
  return scored.slice(0, limit).map((s) => ({
    name: s.name, path: s.path, svgUrl: CDN + version + s.path, version, pkg: PKG, style: s.style,
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
    license: 'MIT',
    licenseUrl: 'https://opensource.org/licenses/MIT',
    licenseType: 'mit',
    attributionRequired: false,
    commercialUse: true,
    modificationAllowed: true,
    metadata: { pkg: raw.pkg, version: raw.version, path: raw.path, style: raw.style },
  };
}

module.exports = {
  id: 'evicons',
  name: 'Eva Icons',
  website: 'https://akveo.github.io/eva-icons/',
  type: 'icon',
  transport: 'package',
  docsUrl: 'https://data.jsdelivr.com/v1/packages/npm/eva-icons',
  endpointVerified: false,
  requiresKey: false,
  envKey: null,
  enabled: true,
  priority: 87,
  tags: ['icon'],
  categories: ['icon'],
  capabilities: { search: true, metadata: true, download: true, api: false, publicPage: false, vectors: true, illustrations: false, wallpapers: false, licenseMetadata: true },
  rateLimit: { requestsPerMinute: 30, delayMs: 500, dailyLimit: null },
  defaultLicense: { license: 'MIT', licenseUrl: 'https://opensource.org/licenses/MIT', licenseType: 'mit', attributionRequired: false, commercialUse: true, modificationAllowed: true, notes: 'MIT per repo LICENSE; include copyright notice in redistributions.' },
  search,
  mapResult,
};
