'use strict';

/**
 * test/run.cjs — offline test suite. No network: every adapter test stubs
 * http.fetchJson with a canned fixture. Run: node test/run.cjs
 */
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const http = require('../src/http.cjs');
const { normalize, termHits } = require('../src/query.cjs');
const { fromWikimedia, unknown } = require('../src/license.cjs');
const { dedup, normUrl } = require('../src/dedup.cjs');
const { rank } = require('../src/ranker.cjs');
const { format } = require('../src/output.cjs');
const { isPrivateIp, assertPublicHost } = require('../src/download.cjs');
const sources = require('../src/sources/index.cjs');
const imgflip = require('../src/sources/imgflip.cjs');
const memeapi = require('../src/sources/memeapi.cjs');
const wikimedia = require('../src/sources/wikimedia.cjs');

let pass = 0, fail = 0;
(async () => {
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}
function eq(a, b, name) { ok(a === b, `${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ---------- query ----------
{
  const q = normalize('Pepe the Frog!!');
  eq(JSON.stringify(q.terms), JSON.stringify(['pepe', 'frog']), 'query terms');
  ok(q.isPepe === true, 'query isPepe flag');
  const q2 = normalize('the');
  eq(q2.terms.length, 0, 'stopwords removed');
  eq(termHits(q, 'Sad Pepe the frog meme'), 2, 'termHits counts');
  eq(termHits(q, 'drake hotline'), 0, 'termHits zero');
}

// ---------- license engine ----------
{
  const free = fromWikimedia({
    LicenseShortName: { value: 'CC BY 2.0' },
    LicenseUrl: { value: 'https://creativecommons.org/licenses/by/2.0' },
    Artist: { value: '<a href="x">Bob</a>' },
  });
  eq(free.status, 'free', 'CC BY 2.0 is free');
  ok(free.attribution.includes('Bob'), 'attribution keeps artist');
  ok(free.url.includes('creativecommons.org'), 'license url kept');

  const pd = fromWikimedia({ LicenseShortName: { value: 'Public domain' } });
  eq(pd.status, 'free', 'public domain is free');

  const arr = fromWikimedia({ LicenseShortName: { value: 'All rights reserved' } });
  eq(arr.status, 'unknown', 'all-rights-reserved is NOT free');

  const empty = fromWikimedia({});
  eq(empty.status, 'unknown', 'missing metadata is NOT free');

  const u = unknown('test');
  eq(u.status, 'unknown', 'unknown() helper');
}

// ---------- dedup ----------
{
  eq(normUrl('https://i.redd.it/abc.png?width=108&s=xyz'), normUrl('https://I.REDD.IT/abc.png'), 'normUrl strips params/case');
  const items = [
    { imageUrl: 'https://i.redd.it/a.png?width=108' },
    { imageUrl: 'https://i.redd.it/a.png?width=640' },
    { imageUrl: 'https://i.imgflip.com/30b1gx.jpg' },
  ];
  eq(dedup(items).length, 2, 'dedup collapses param variants');
}

// ---------- ranker ----------
{
  const q = normalize('pepe');
  const a = { title: 'pepe', ups: 0, nsfw: false, license: unknown('x'), _termHits: 1 };
  const b = { title: 'pepe', ups: 10000, nsfw: false, license: unknown('x'), _termHits: 1 };
  const c = { title: 'pepe', ups: 0, nsfw: false, license: { status: 'free', name: 'CC BY 2.0' }, _termHits: 1 };
  const ranked = rank([a, b, c], q);
  ok(ranked[0] === b, 'upvotes outrank base');
  ok(ranked[1] === c, 'free license outranks unknown at equal ups');
}

// ---------- output ----------
{
  const items = [{
    score: 9.5, source: 'wikimedia', title: 'Pepe "the" frog',
    imageUrl: 'https://x/y.jpg', pageUrl: 'https://x', author: 'A "B"',
    ups: 0, nsfw: false, license: { status: 'free', name: 'CC BY 2.0' },
  }];
  const csvOut = format(items, 'csv');
  ok(csvOut.startsWith('score,source,title'), 'csv header');
  ok(csvOut.includes('"Pepe ""the"" frog"'), 'csv quotes escaped');
  const txtOut = format(items, 'txt');
  ok(txtOut.includes('https://x/y.jpg'), 'txt has url');
  ok(format(items, 'json').includes('"license"'), 'json has license');
}

// ---------- download guards ----------
{
  ok(isPrivateIp('127.0.0.1') === true, 'loopback is private');
  ok(isPrivateIp('192.168.1.5') === true, 'rfc1918 is private');
  ok(isPrivateIp('10.0.0.1') === true, '10/8 is private');
  ok(isPrivateIp('8.8.8.8') === false, 'public ip is public');
  ok(isPrivateIp('::1') === true, 'ipv6 loopback is private');
  let threw = false;
  try { await assertPublicHost('http://127.0.0.1/evil.png'); } catch { threw = true; }
  ok(threw, 'assertPublicHost refuses loopback');
  threw = false;
  try { await assertPublicHost('ftp://example.com/x'); } catch { threw = true; }
  ok(threw, 'assertPublicHost refuses ftp');
}

// ---------- source registry ----------
{
  const names = sources.list().map((s) => s.name);
  ok(names.includes('imgflip') && names.includes('memeapi') && names.includes('wikimedia'), 'live sources registered');
  const g = sources.get('giphy');
  eq(g.status, 'auth_required', 'giphy is auth_required stub');
  let threw = false;
  try { await g.search(); } catch { threw = true; }
  ok(threw, 'giphy stub refuses without key');
}

// ---------- adapters (stubbed fetch) ----------
const realFetch = http.fetchJson;
{
  // imgflip
  http.fetchJson = async () => ({
    success: true,
    data: { memes: [
      { id: '1', name: 'Drake Hotline Bling', url: 'https://i.imgflip.com/30b1gx.jpg', width: 1200, height: 1200, captions: 5 },
      { id: '2', name: 'Sad Pepe', url: 'https://i.imgflip.com/pepe.jpg', width: 600, height: 600, captions: 9 },
    ]},
  });
  const q = normalize('pepe');
  const hits = await imgflip.search(q, {});
  eq(hits.length, 1, 'imgflip filters by name');
  eq(hits[0].license.status, 'unknown', 'imgflip labeled unknown');

  // memeapi
  http.fetchJson = async (url) => ({
    count: 3,
    memes: [
      { postLink: 'https://redd.it/a1', title: 'pepe business', url: 'https://i.redd.it/a1.png', nsfw: false, author: 'u1', ups: 100 },
      { postLink: 'https://redd.it/a2', title: 'pepe nsfw thing', url: 'https://i.redd.it/a2.png', nsfw: true, author: 'u2', ups: 50 },
      { postLink: 'https://redd.it/a3', title: 'pepe video', url: 'https://v.redd.it/a3', nsfw: false, author: 'u3', ups: 10 },
      { postLink: 'https://redd.it/a4', title: 'drake meme', url: 'https://i.redd.it/a4.png', nsfw: false, author: 'u4', ups: 10 },
    ],
  });
  const mhits = await memeapi.search(q, { limit: 10, nsfw: false });
  ok(mhits.length >= 1, 'memeapi returns matches');
  ok(mhits.every((m) => !m.nsfw), 'memeapi filters nsfw by default');
  ok(mhits.every((m) => m.imageUrl.startsWith('https://i.redd.it/')), 'memeapi keeps images only');
  ok(memeapi.pickSubs(q).includes('pepethefrog'), 'pepe routes to r/pepethefrog');
  const qd = normalize('drake');
  ok(!memeapi.pickSubs(qd).includes('pepethefrog'), 'non-pepe skips r/pepethefrog');

  // wikimedia
  http.fetchJson = async () => ({
    query: { pages: { 1: {
      pageid: 1, title: 'File:Pepe the Frog.jpg',
      imageinfo: [{ url: 'https://upload.wikimedia.org/x/pepe.jpg', width: 800, height: 600,
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Pepe_the_Frog.jpg',
        extmetadata: {
          LicenseShortName: { value: 'CC BY-SA 4.0' },
          LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
          Artist: { value: 'Jane' },
        } }],
    }}},
  });
  const whits = await wikimedia.search(q, {});
  eq(whits.length, 1, 'wikimedia returns file');
  eq(whits[0].license.status, 'free', 'wikimedia CC file is free');
  ok(whits[0].license.attribution.includes('Jane'), 'wikimedia attribution');
}
http.fetchJson = realFetch;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('test harness crashed:', e); process.exit(1); });
