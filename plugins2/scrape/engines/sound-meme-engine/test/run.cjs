'use strict';

/**
 * test/run.cjs — offline suite. Adapters tested with stubbed http.
 */
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const http = require('../src/http.cjs');
const { normalize, termHits } = require('../src/query.cjs');
const { fromWikimedia, unknown } = require('../src/license.cjs');
const { dedup } = require('../src/dedup.cjs');
const { rank } = require('../src/ranker.cjs');
const { format } = require('../src/output.cjs');
const { isPrivateIp, assertPublicHost } = require('../src/download.cjs');
const sources = require('../src/sources/index.cjs');
const wma = require('../src/sources/wikimedia-audio.cjs');
const yt = require('../src/sources/youtube.cjs');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; console.error('FAIL:', name); }
}
function eq(a, b, name) { ok(a === b, `${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

(async () => {

// ---------- query ----------
{
  const q = normalize('Anime meme SOUND effect!!');
  eq(JSON.stringify(q.terms), JSON.stringify(['anime']), 'query strips sound/meme stopwords');
  ok(q.isAnime === true, 'isAnime flag');
  eq(termHits(q, 'Anime ahhhh sound'), 1, 'termHits');
}

// ---------- license ----------
{
  const free = fromWikimedia({ LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://x' }, Artist: { value: 'Jane' } });
  eq(free.status, 'free', 'CC BY-SA 4.0 is free');
  eq(fromWikimedia({}).status, 'unknown', 'missing license is unknown');
  eq(unknown('x').status, 'unknown', 'unknown() helper');
}

// ---------- youtube helpers ----------
{
  eq(yt.parseDuration('1:23'), 83, 'parseDuration m:ss');
  eq(yt.parseDuration('12'), 12, 'parseDuration s');
  eq(yt.parseDuration(null), null, 'parseDuration null');
  eq(yt.parseViews('1.2M views'), 1200000, 'parseViews M');
  eq(yt.parseViews('45K views'), 45000, 'parseViews K');
  eq(yt.parseViews('987 views'), 987, 'parseViews plain');
  const html = '<html><script>var ytInitialData = {"contents":{"x":[{"videoRenderer":{"videoId":"SkWbQYyqtL0","title":{"runs":[{"text":"Anime ahhhh"}]},"ownerText":{"runs":[{"text":"Chan"}]},"lengthText":{"simpleText":"0:07"},"viewCountText":{"simpleText":"1.5M views"}}}]}};</script></html>';
  const data = yt.extractInitialData(html);
  const out = [];
  yt.collectVideos(data, out);
  eq(out.length, 1, 'collectVideos finds one');
  eq(out[0].title, 'Anime ahhhh', 'collectVideos title');
  eq(out[0].durationSec, 7, 'collectVideos duration');
  eq(out[0].views, 1500000, 'collectVideos views');
  eq(out[0].downloadable, false, 'youtube never downloadable');
  eq(out[0].license.status, 'unknown', 'youtube license unknown');
  let threw = false;
  try { yt.extractInitialData('<html>nope</html>'); } catch { threw = true; }
  ok(threw, 'extractInitialData throws on shape change');
}

// ---------- dedup / ranker ----------
{
  const items = [
    { id: 'youtube:a', kind: 'video-link', mediaUrl: null },
    { id: 'youtube:a', kind: 'video-link', mediaUrl: null },
    { id: 'w:1', kind: 'audio', mediaUrl: 'https://upload.wikimedia.org/x/a.ogg' },
  ];
  eq(dedup(items).length, 2, 'dedup by kind-aware key');
  const q = normalize('boom');
  const a = { title: 'vine boom', views: 0, downloadable: false, license: unknown('x'), _termHits: 1 };
  const b = { title: 'vine boom', views: 0, downloadable: true, license: { status: 'free', name: 'CC0' }, _termHits: 1 };
  const ranked = rank([a, b], q);
  ok(ranked[0] === b, 'free+downloadable outranks link-only');
}

// ---------- output ----------
{
  const items = [{ score: 9, source: 'youtube', kind: 'video-link', title: 'A "B"',
    mediaUrl: null, pageUrl: 'https://youtube.com/watch?v=x', author: 'C',
    durationSec: 7, views: 10, downloadable: false, license: { status: 'unknown' } }];
  ok(format(items, 'csv').startsWith('score,source,kind'), 'csv header');
  ok(format(items, 'txt').includes('youtube.com/watch'), 'txt has page url');
}

// ---------- download guards ----------
{
  ok(isPrivateIp('127.0.0.1') === true, 'loopback private');
  ok(isPrivateIp('8.8.8.8') === false, 'public ip public');
  let threw = false;
  try { await assertPublicHost('http://127.0.0.1/x.mp3'); } catch { threw = true; }
  ok(threw, 'refuses loopback host');
}

// ---------- registry ----------
{
  const names = sources.list().map((s) => s.name);
  ok(names.includes('wikimedia-audio') && names.includes('youtube'), 'live sources registered');
  for (const n of ['myinstants', 'voicy', '101soundboards', 'mixkit']) {
    const s = sources.get(n);
    eq(s.status, 'blocked', `${n} is blocked stub`);
    let threw = false;
    try { await s.search(); } catch (e) { threw = /blocked/.test(e.message); }
    ok(threw, `${n} stub explains block`);
  }
}

// ---------- adapters (stubbed) ----------
const realText = http.fetchText, realJson = http.fetchJson;
{
  http.fetchJson = async () => ({
    query: { pages: { 7: {
      pageid: 7, title: 'File:Vine boom.ogg',
      imageinfo: [{ url: 'https://upload.wikimedia.org/x/vineboom.ogg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Vine_boom.ogg',
        extmetadata: { LicenseShortName: { value: 'CC0' },
          LicenseUrl: { value: 'https://creativecommons.org/publicdomain/zero/1.0/' },
          Artist: { value: 'Anon' } } }],
    }}},
  });
  const q = normalize('vine boom');
  const hits = await wma.search(q, {});
  eq(hits.length, 1, 'wikimedia-audio returns ogg');
  eq(hits[0].license.status, 'free', 'wikimedia-audio CC0 is free');
  eq(hits[0].downloadable, true, 'wikimedia-audio downloadable');

  http.fetchText = async () => '<script>var ytInitialData = {"a":[{"videoRenderer":{"videoId":"dQw4w9WgXcQ","title":{"runs":[{"text":"vine boom sound effect"}]},"lengthText":{"simpleText":"0:05"},"viewCountText":{"simpleText":"2M views"}}}]};</script>';
  const yhits = await yt.search(q, {});
  eq(yhits.length, 1, 'youtube search parses fixture');
  eq(yhits[0].pageUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube watch url');
}
http.fetchText = realText; http.fetchJson = realJson;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
