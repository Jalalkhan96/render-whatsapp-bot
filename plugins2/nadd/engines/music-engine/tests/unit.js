'use strict';
/**
 * Unit tests — no network. Covers spec #97 (search cases), #98 (exact
 * version distinctions), #34 (normalization), #73 (ranking bands).
 *   node tests/unit.js
 */
const assert = require('assert');
const {
  normalize, splitVersion, romanVariants, isISRC, extractISRC, classifyQuery,
} = require('../music/query-normalizer');
const { similarity, scoreCandidate, versionsConflict } = require('../music/track-matcher');
const { rankResult } = require('../music/result-ranker');
const { deduplicate } = require('../music/deduplicator');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error('FAIL:', name, '-', e.message); }
}

// ---------- #34 normalization ----------
test('weeknd case variants map consistently', () => {
  assert.strictEqual(normalize('The Weeknd'), normalize('the weeknd'));
  assert.strictEqual(normalize('THE WEEKND'), normalize('the weeknd'));
});
test('diacritics stripped', () => {
  assert.strictEqual(normalize('Afreén Afreén'), 'afreen afreen');
});
test('apostrophes unified', () => {
  assert.strictEqual(normalize('Tajdar-e-Haram'), normalize('Tajdar‐e‐Haram')); // U+2010 hyphens
});
test('Kahani Suno 2.0 stays distinguishable', () => {
  const a = splitVersion('Kahani Suno');
  const b = splitVersion('Kahani Suno 2.0');
  assert.strictEqual(a.base, 'Kahani Suno');
  assert.ok(b.versions.length > 0, '2.0 must be detected as a version tag');
  assert.notStrictEqual(normalize(a.base), normalize(b.base + ' ' + b.versions.join(' ')));
});
test('roman variants include afrin spelling', () => {
  const v = romanVariants('Afreen Afreen');
  assert.ok(v.some((x) => x.includes('afrin')), 'expected afrin variant, got ' + v.join(','));
});

// ---------- ISRC ----------
test('isrc detection', () => {
  assert.ok(isISRC('USRC17607839'));
  assert.strictEqual(extractISRC('isrc USRC17607839 here'), 'USRC17607839');
  assert.ok(!isISRC('Blinding Lights'));
});

// ---------- query classification ----------
test('classify spotify url', () => {
  const c = classifyQuery('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b');
  assert.strictEqual(c.kind, 'url');
  assert.strictEqual(c.url.platform, 'spotify');
});
test('classify youtube url', () => {
  const c = classifyQuery('https://www.youtube.com/watch?v=4NRXx6U8ABQ');
  assert.strictEqual(c.kind, 'url');
  assert.strictEqual(c.url.platform, 'youtube');
});
test('classify isrc', () => {
  const c = classifyQuery('USRC17607839');
  assert.strictEqual(c.kind, 'isrc');
});
test('classify title - artist', () => {
  const c = classifyQuery('Kahani Suno - Kaifi Khalil');
  assert.strictEqual(c.kind, 'title-artist');
  assert.strictEqual(c.title, 'Kahani Suno');
});
test('classify lyric fragment (quoted)', () => {
  const c = classifyQuery('"hello from the other side"');
  assert.strictEqual(c.kind, 'lyrics-fragment');
});
test('classify lyric fragment (long sentence)', () => {
  const c = classifyQuery('i remember something bout you and all the things we used to do');
  assert.strictEqual(c.kind, 'lyrics-fragment');
});

// ---------- #98 exact version distinctions ----------
const CANDS = {
  original: { title: 'Blinding Lights', artist: 'The Weeknd', durationMs: 200000 },
  remix: { title: 'Blinding Lights (Remix)', artist: 'The Weeknd', durationMs: 210000 },
  live: { title: 'Blinding Lights - Live', artist: 'The Weeknd', durationMs: 230000 },
  spedup: { title: 'Blinding Lights (Sped Up)', artist: 'The Weeknd', durationMs: 170000 },
};
test('remix query must not match original highly', () => {
  const s = scoreCandidate({ kind: 'text', raw: 'Blinding Lights remix', title: 'Blinding Lights (Remix)' }, CANDS.original);
  assert.ok(s.confidence < 0.7, 'original should score low for remix query, got ' + s.confidence);
});
test('remix query matches remix candidate', () => {
  const s = scoreCandidate({ kind: 'text', raw: 'Blinding Lights remix', title: 'Blinding Lights (Remix)' }, CANDS.remix);
  assert.ok(s.confidence >= 0.7, 'remix should score high, got ' + s.confidence);
});
test('live query conflicts with studio candidate', () => {
  assert.ok(versionsConflict(['live'], []));
  const s = scoreCandidate({ kind: 'text', raw: 'Blinding Lights live', title: 'Blinding Lights (Live)' }, CANDS.original);
  assert.ok(!s.match, 'live query must not match studio version');
});
test('sped-up stays distinct from original', () => {
  const s = scoreCandidate({ kind: 'text', raw: 'Blinding Lights sped up', title: 'Blinding Lights (Sped Up)' }, CANDS.original);
  assert.ok(!s.match);
});

// ---------- dedup keeps versions apart ----------
test('deduplicator does not merge remix with original', () => {
  const out = deduplicate([CANDS.original, CANDS.remix, CANDS.live, CANDS.spedup]);
  assert.strictEqual(out.length, 4, 'expected 4 distinct recordings, got ' + out.length);
});
test('deduplicator merges true duplicates (isrc)', () => {
  const a = { title: 'Pasoori', artist: 'Ali Sethi', isrc: 'PKABC2300001', source: 'spotify' };
  const b = { title: 'Pasoori', artist: 'Ali Sethi', isrc: 'pkabc2300001', source: 'deezer' };
  const out = deduplicate([a, b]);
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(out[0].sources.sort(), ['deezer', 'spotify']);
});

// ---------- #73 ranking bands (literal point scheme: 25+25+30+10+5+5) ----------
test('ranking: exact title+artist+isrc+agreement => 85 probable', () => {
  const r = rankResult(
    { title: 'Blinding Lights', artist: 'The Weeknd', isrc: 'USRC11901586' },
    { title: 'Blinding Lights', artist: 'The Weeknd', isrc: 'USRC11901586' }, 2);
  assert.strictEqual(r.points, 85);
  assert.strictEqual(r.band, 'probable');
});
test('ranking: full verification (album+duration too) => strong', () => {
  const r = rankResult(
    { title: 'Blinding Lights', artist: 'The Weeknd', isrc: 'USRC11901586', album: 'After Hours', durationMs: 200000 },
    { title: 'Blinding Lights', artist: 'The Weeknd', isrc: 'USRC11901586', album: 'After Hours', durationMs: 200500 }, 2);
  assert.strictEqual(r.points, 100);
  assert.strictEqual(r.band, 'strong');
});
test('ranking: title only => uncertain', () => {
  const r = rankResult({ title: 'Stay', raw: 'Stay' }, { title: 'Stay', artist: 'Rihanna' }, 0);
  assert.ok(r.confidence < 0.7, 'got ' + r.confidence);
  assert.strictEqual(r.band, 'uncertain');
});

// ---------- keyword-stuffing spam defense ----------
const SPAM = { title: 'Blinding Lights The Weeknd', artist: 'Pancadão GD Som' };
const REAL = { title: 'Blinding Lights', artist: 'The Weeknd' };
test('keyword-stuffed spam title must not match', () => {
  const s = scoreCandidate({ kind: 'text', raw: 'Blinding Lights The Weeknd' }, SPAM);
  assert.ok(!s.match, 'spam matched with conf ' + s.confidence);
  assert.ok(s.confidence < 0.7, 'spam conf too high: ' + s.confidence);
});
test('real track still matches strongly on title+artist query', () => {
  const s = scoreCandidate({ kind: 'text', raw: 'Blinding Lights The Weeknd' }, REAL);
  assert.ok(s.match, 'real track did not match: ' + s.confidence);
  assert.ok(s.confidence >= 0.9, 'real track conf too low: ' + s.confidence);
});
test('version word in artist slot still resolves (remix)', () => {
  const s = scoreCandidate({ kind: 'text', raw: 'Blinding Lights remix' }, CANDS.remix);
  assert.ok(s.confidence >= 0.7, 'remix conf too low: ' + s.confidence);
  const s2 = scoreCandidate({ kind: 'text', raw: 'Blinding Lights remix' }, CANDS.original);
  assert.ok(!s2.match, 'original matched a remix query');
});
test('legit multi-word title without artist still matches', () => {
  const s = scoreCandidate({ kind: 'text', raw: 'Tajdar-e-Haram' }, { title: 'Tajdar-e-Haram', artist: 'Sabri Brothers' });
  assert.ok(s.match, 'conf ' + s.confidence);
});

// ---------- similarity sanity ----------
test('similarity handles misspellings', () => {
  assert.ok(similarity('Blinding Lights', 'Blinding Light') > 0.85);
  assert.ok(similarity('Kahani Suno', 'Kahani Sunno') > 0.8);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
