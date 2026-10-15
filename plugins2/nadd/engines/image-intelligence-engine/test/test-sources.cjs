'use strict';
/**
 * OFFLINE test suite — no network. Run: node test/test-sources.cjs
 * Exit non-zero on any failure.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.error('  FAIL:', name); }
}

// ---------- 1. registry: exactly 100 unique ids ----------
console.log('[1] registry');
const registry = require(path.join(ROOT, 'lib', 'registry.js'));
ok(Array.isArray(registry.IDS) && registry.IDS.length === 100, 'registry.IDS has exactly 100 entries');
ok(new Set(registry.IDS).size === 100, 'registry ids unique');
let all = null;
try {
  all = registry.all();
  ok(all.length === 100, 'registry.all() returns 100 sources');
} catch (e) { ok(false, 'registry.all() loads: ' + e.message); }

// ---------- 2. every adapter: contract fields + functions ----------
console.log('[2] adapter contract');
const REQUIRED = ['id','name','website','type','transport','docsUrl','enabled','priority','categories','capabilities','rateLimit','defaultLicense','search','mapResult'];
const TYPES = new Set(['photo','illustration','vector','icon','wallpaper','museum','archive','mixed']);
const TRANSPORTS = new Set(['api','feed','package','page']);
if (all) {
  for (const s of all) {
    const a = s._adapter;
    for (const f of REQUIRED) ok(a[f] !== undefined, `${s.id}: field ${f} present`);
    ok(typeof a.search === 'function', `${s.id}: search is function`);
    ok(typeof a.mapResult === 'function', `${s.id}: mapResult is function`);
    ok(TYPES.has(a.type), `${s.id}: valid type (${a.type})`);
    ok(TRANSPORTS.has(a.transport), `${s.id}: valid transport (${a.transport})`);
    ok(typeof a.endpointVerified === 'boolean', `${s.id}: endpointVerified is boolean`);
    ok(typeof a.requiresKey === 'boolean', `${s.id}: requiresKey is boolean`);
    ok(!a.requiresKey || a.envKey, `${s.id}: requiresKey -> envKey set`);
    ok(a.capabilities && a.capabilities.search === true, `${s.id}: capabilities.search`);
    ok(a.rateLimit && a.rateLimit.requestsPerMinute > 0, `${s.id}: rateLimit set`);
    // no placeholder stubs
    const src = fs.readFileSync(path.join(ROOT, 'sources', s.id + '.js'), 'utf8');
    ok(!/not implemented|TODO:/i.test(src), `${s.id}: no TODO/not-implemented stubs`);
    ok(src.length > 800, `${s.id}: real implementation (>800 chars)`);
  }
}

// ---------- 3. mapResult -> normalize: universal object, license honesty ----------
console.log('[3] normalize + license honesty');
const { normalize, UNIVERSAL_KEYS } = require(path.join(ROOT, 'lib', 'normalizer.js'));
if (all) {
  const sampleRaw = { id: 'x1', title: 'Test Sunset Photo', imageUrl: 'https://example.com/x.jpg', tags: ['sunset'] };
  const noLicenseRaw = { id: 'x2', title: 'Mystery', imageUrl: 'https://example.com/y.jpg' };
  for (const s of all) {
    try {
      const partial = s._adapter.mapResult(sampleRaw);
      ok(partial && typeof partial === 'object', `${s.id}: mapResult returns object`);
      const img = normalize(partial, s._adapter);
      for (const k of UNIVERSAL_KEYS) ok(k in img, `${s.id}: universal key ${k}`);
      // license honesty: no license in raw ->
      //   * adapter with a declared site-wide defaultLicense may apply it (not invented)
      //   * adapter with defaultLicense 'Unknown' must keep Unknown + licenseUnknown:true
      const dl = (s._adapter.defaultLicense && s._adapter.defaultLicense.license) || 'Unknown';
      const img2 = normalize(s._adapter.mapResult(noLicenseRaw), s._adapter);
      if (dl !== 'Unknown') {
        ok(img2.license === dl || img2.license === 'Unknown',
          `${s.id}: site license applied honestly (got ${img2.license})`);
      } else {
        ok(img2.license === 'Unknown' && img2.licenseUnknown === true, `${s.id}: unknown stays unknown`);
      }
      ok(img2.license !== 'free' && img2.license !== 'Free', `${s.id}: never maps to 'free'`);
    } catch (e) {
      ok(false, `${s.id}: mapResult/normalize threw: ${e.message}`);
    }
  }
}

// ---------- 4. license.js ----------
console.log('[4] license.js');
const L = require(path.join(ROOT, 'lib', 'license.js'));
ok(L.parseLicenseString('CC0 1.0 Universal').license === 'CC0', 'parse CC0');
ok(L.parseLicenseString('CC BY-NC 4.0').license === 'CC BY-NC', 'parse CC BY-NC');
ok(L.parseLicenseString('Public Domain Mark 1.0').license === 'Public Domain Mark', 'parse PDM');
ok(L.parseLicenseString('mystery license xyz').license === 'Unknown', 'unknown stays unknown');
ok(L.parseLicenseString('').license === 'Unknown', 'empty -> Unknown');
ok(L.parseLicenseString('royalty-free stock photo').license === 'Site-specific free license', 'royalty-free NOT public domain');
const imgCC0 = { license: 'CC0', commercialUse: true, attributionRequired: false };
const imgUnk = { license: 'Unknown', commercialUse: null, attributionRequired: null, licenseUnknown: true };
const imgNC = { license: 'CC BY-NC', commercialUse: false, attributionRequired: true };
ok(L.passesLicenseFilter(imgCC0, { commercial: true }) === true, 'commercial passes for CC0');
ok(L.passesLicenseFilter(imgUnk, { commercial: true }) === false, 'commercial excludes unknown commercialUse');
ok(L.passesLicenseFilter(imgUnk, { noAttribution: true }) === false, 'no-attribution excludes unknown attribution');
ok(L.passesLicenseFilter(imgNC, { license: 'cc0' }) === false, 'license filter cc0 excludes BY-NC');
ok(L.passesLicenseFilter(imgCC0, { license: 'public-domain' }) === true, 'public-domain filter includes CC0');
ok(L.decideDownload({ license: 'Restricted' }).allow === 'deny', 'restricted -> deny');
ok(L.decideDownload(imgUnk).allow === 'warn', 'unknown -> warn');
ok(L.decideDownload(imgCC0).allow === 'allow', 'CC0 -> allow');
ok(L.attributionText(imgUnk).includes('license unknown'), 'attributionText honest for unknown');

// ---------- 5. query.js ----------
console.log('[5] query.js');
const Q = require(path.join(ROOT, 'lib', 'query.js'));
let r = Q.parseFlags('sunset --limit 20 --landscape');
ok(r.query === 'sunset' && r.filters.limit === 20 && r.filters.orientation === 'landscape', 'parse limit+landscape');
r = Q.parseFlags('--4k --commercial mountains');
ok(r.query === 'mountains' && r.filters.minWidth === 3840 && r.filters.commercial === true, 'parse 4k+commercial');
r = Q.parseFlags('--cc0 --no-attribution --min-width 2000 cats');
ok(r.query === 'cats' && r.filters.license === 'cc0' && r.filters.noAttribution && r.filters.minWidth === 2000, 'parse cc0+no-attribution+min-width');
r = Q.parseFlags('--license cc-by --color blue --page 2 dogs');
ok(r.filters.license === 'cc-by' && r.filters.color === 'blue' && r.filters.page === 2 && r.query === 'dogs', 'parse license+color+page');
r = Q.parseFlags('--transparent --square icon');
ok(r.filters.transparent && r.filters.orientation === 'square', 'parse transparent+square');
ok(Q.normalizeQuery('  hello   world ') === 'hello world', 'normalizeQuery');

// ---------- 6. ranker ----------
console.log('[6] ranker');
const { rank } = require(path.join(ROOT, 'lib', 'ranker.js'));
const imgs = [
  { title: 'A random car on the street', tags: ['car'], width: 800, height: 600, license: 'Unknown', licenseUnknown: true, metadata: {} },
  { title: 'Sunset over mountains', tags: ['sunset', 'mountains'], width: 6000, height: 4000, license: 'CC0', licenseUnknown: false, commercialUse: true, metadata: { likes: 5000 } },
];
rank(imgs, 'sunset mountains', {}, () => 50);
ok(imgs[0].title.includes('Sunset') && imgs[0].score > imgs[1].score, 'ranker orders higher-relevance first');
ok(imgs[0].score <= 100 && imgs[0].reasons.length > 0, 'score bounded, reasons present');

// ---------- 7. dedup ----------
console.log('[7] dedup');
const { dedupe } = require(path.join(ROOT, 'lib', 'dedup.js'));
const dupes = [
  { source: 'Unsplash', sourceKey: 'unsplash', sourceId: 'a1', title: 'Sunset', creator: 'John', imageUrl: 'https://x.com/a.jpg?utm_source=foo', width: 100, height: 100 },
  { source: 'Openverse', sourceKey: 'openverse', sourceId: 'b2', title: 'Sunset', creator: 'John', imageUrl: 'https://x.com/a.jpg', width: 2000, height: 1000 },
  { source: 'Pexels', sourceKey: 'pexels', sourceId: 'c3', title: 'Totally different', creator: 'Jane', imageUrl: 'https://y.com/b.jpg', width: 100, height: 100 },
];
const dd = dedupe(dupes);
ok(dd.length === 2, 'dedup merges URL dupes (2 groups)');
const merged = dd.find((g) => g.alsoFrom.length > 0);
ok(merged && merged.alsoFrom[0].source === 'Unsplash', 'alsoFrom attached, highest-res kept');

// ---------- 8. svg-sanitize ----------
console.log('[8] svg-sanitize');
const { sanitizeSvg } = require(path.join(ROOT, 'lib', 'svg-sanitize.js'));
const dirty = '<svg xmlns="http://www.w3.org/2000/svg" onclick="evil()"><script>alert(1)</script><a href="javascript:evil()"><rect onload="x()" width="10"/></a><foreignObject><body>hi</body></foreignObject></svg>';
const clean = sanitizeSvg(dirty);
ok(!/<script/i.test(clean), 'strips script');
ok(!/onclick|onload/i.test(clean), 'strips event handlers');
ok(!/javascript:/i.test(clean), 'strips javascript: urls');
ok(!/foreignObject/i.test(clean), 'strips foreignObject');
ok(/<svg/.test(clean) && /<rect/.test(clean), 'keeps safe svg content');

// ---------- 9. http.js SSRF ----------
console.log('[9] http SSRF');
const { isPrivateIp } = require(path.join(ROOT, 'lib', 'http.js'));
ok(isPrivateIp('127.0.0.1') === true, 'rejects 127.0.0.1');
ok(isPrivateIp('10.0.0.5') === true, 'rejects 10.0.0.5');
ok(isPrivateIp('192.168.1.1') === true, 'rejects 192.168.1.1');
ok(isPrivateIp('172.16.5.4') === true, 'rejects 172.16.5.4');
ok(isPrivateIp('169.254.10.20') === true, 'rejects 169.254.10.20');
ok(isPrivateIp('::1') === true, 'rejects ::1');
ok(isPrivateIp('8.8.8.8') === false, 'allows 8.8.8.8');
ok(isPrivateIp('1.1.1.1') === false, 'allows 1.1.1.1');

// ---------- 10. selector ----------
console.log('[10] selector');
const { selectSources, COMMAND_SOURCE_MAP } = require(path.join(ROOT, 'lib', 'selector.js'));
if (all) {
  const sel = selectSources('photo', 'sunset', { maxSources: 5 }, all, null);
  ok(sel.length === 5, 'selectSources honors maxSources');
  ok(sel[0].id === 'unsplash', 'photo starts with unsplash');
  const wsel = selectSources('wallpaper', 'cars', {}, all, null);
  ok(wsel.some((s) => s.id === 'wallhaven'), 'wallpaper includes wallhaven');
  const isel = selectSources('icon', 'camera', {}, all, null);
  ok(isel.some((s) => s.id === 'lucide'), 'icon includes lucide');
  ok(COMMAND_SOURCE_MAP.publicdomain.includes('wikimedia'), 'publicdomain map ok');
}

// ---------- 11. download.js magic bytes ----------
console.log('[11] download mime');
const { detectMime } = require(path.join(ROOT, 'lib', 'download.js'));
ok(detectMime(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0])) === 'image/jpeg', 'detect jpeg');
ok(detectMime(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) === 'image/png', 'detect png');
ok(detectMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')) === 'image/svg+xml', 'detect svg');
ok(detectMime(Buffer.from('MZ\x90\x00')) === null, 'reject MZ executable');

// ---------- 12. phash ----------
console.log('[12] phash');
const { dHash, hammingDistance } = require(path.join(ROOT, 'lib', 'phash.js'));
const px = Buffer.alloc(16 * 16 * 4, 128);
const h1 = dHash(px, 16, 16);
ok(/^[0-9a-f]{16}$/.test(h1), 'dHash returns 16 hex chars');
ok(hammingDistance(h1, h1) === 0, 'hamming self = 0');

// ---------- 13. engine offline (mock sources) ----------
console.log('[13] engine');
const { ImageSearchEngine } = require(path.join(ROOT, 'lib', 'engine.js'));
(async () => {
  const fakeSources = [
    {
      id: 's1', name: 'S1', priority: 1, enabled: true,
      _adapter: {
        id: 's1', name: 'S1',
        rateLimit: { requestsPerMinute: 1000, delayMs: 0 },
        search: async (q) => [{ sourceId: '1', title: q + ' photo one', imageUrl: 'https://a.com/1.jpg', width: 2000, height: 1000, license: 'CC0' }],
        mapResult: (x) => x,
      },
    },
    {
      id: 's2', name: 'S2', priority: 2, enabled: true,
      _adapter: {
        id: 's2', name: 'S2',
        rateLimit: { requestsPerMinute: 1000, delayMs: 0 },
        search: async () => { throw new Error('boom'); },
        mapResult: (x) => x,
      },
    },
  ];
  const eng = new ImageSearchEngine({ sources: fakeSources });
  // 'imageall' uses priority order of the provided sources (selector maps
  // named commands to registry ids, which our fakes don't have)
  const out = await eng.search('sunset', { command: 'imageall', maxSources: 10, maxResults: 5 });
  ok(out.results.length === 1 && out.results[0].title === 'sunset photo one', 'engine search returns normalized result');
  ok(out.failures.length === 1 && out.failures[0].source === 's2', 'engine isolates source failure');
  ok(out.results[0].license === 'CC0', 'license preserved');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('Failures:\n - ' + failures.slice(0, 40).join('\n - ')); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ENGINE TEST CRASH:', e); process.exit(1); });
