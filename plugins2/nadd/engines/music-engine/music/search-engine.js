'use strict';
/**
 * Search engine — query classification -> sequential provider cascade ->
 * cross-provider verification -> ranked, deduplicated candidates.
 * Never assumes the first result is correct.
 */
const registry = require('./source-registry');
const { classifyQuery, romanVariants } = require('./query-normalizer');
const { bestMatch } = require('./track-matcher');
const { rankResult } = require('./result-ranker');
const { deduplicate } = require('./deduplicator');
const { runSequential } = require('./scheduler');
const cache = require('./cache');

const MAX_RESULTS = parseInt(process.env.MUSIC_MAX_RESULTS || '30', 10);

/** Track-identification priority per spec #93 (subset of metadata providers). */
const IDENTIFY_ORDER = ['musicbrainz', 'spotify', 'apple-music', 'deezer', 'jiosaavn', 'youtube', 'lastfm', 'discogs', 'bandcamp', 'soundcloud'];

function orderedProviders(ids) {
  const out = [];
  for (const id of ids) {
    const e = registry.get(id);
    if (e && e.enabled && e.adapter && e.adapter.search) out.push({ id: e.id, name: e.name, META: e.META, search: e.adapter.search, lookup: e.adapter.lookup });
  }
  return out;
}

async function searchProviders(providers, query, opts = {}) {
  const limit = opts.limit || 8;
  const { results, perSource } = await runSequential(providers, async (p) => {
    try {
      const r = await p.search(query, { limit, signal: opts.signal });
      const items = (r && r.results) || [];
      // tag every item with its source
      for (const it of items) { if (!it.source) it.source = p.id; }
      return { status: (r && r.status) || 'ok', results: items.slice(0, limit), note: r && r.note };
    } catch (err) {
      return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
    }
  }, { resultCap: MAX_RESULTS });
  return { results, perSource };
}

async function searchTrack(rawQuery, opts = {}) {
  const classified = classifyQuery(rawQuery);
  const cacheKey = 'search:' + rawQuery.toLowerCase().slice(0, 120);
  if (!opts.noCache) {
    const hit = cache.get('track', cacheKey);
    if (hit) return Object.assign({}, hit, { fromCache: true });
  }

  let providers;
  let queries = [rawQuery];

  if (classified.kind === 'isrc') {
    // ISRC-first: providers that support ISRC lookup
    providers = orderedProviders(['musicbrainz', 'spotify', 'deezer', 'apple-music']);
    queries = [classified.isrc];
  } else if (classified.kind === 'url') {
    return resolveUrl(classified.url, opts);
  } else if (classified.kind === 'lyrics-fragment') {
    return searchByLyricsFragment(classified.fragment, opts);
  } else {
    providers = orderedProviders(IDENTIFY_ORDER);
    if (classified.kind === 'title-artist') {
      queries = [classified.title + ' ' + classified.artist, classified.title];
    }
  }

  let all = [];
  const perSource = [];
  for (const q of queries) {
    const r = await searchProviders(providers, q, opts);
    all = all.concat(r.results);
    perSource.push(...r.perSource);
    if (all.length >= MAX_RESULTS) break;
  }

  const unique = deduplicate(all);
  const { best, ranked } = bestMatch(classified, unique);

  // point-based ranking for the top candidates
  const agreement = {};
  for (const t of unique) {
    const k = (t.title || '') + '|' + (t.artist || '');
    agreement[k] = (agreement[k] || 0) + 1;
  }
  const rankedWithPoints = ranked.slice(0, 10).map((r) => Object.assign({}, r, {
    points: rankResult(classified, r.candidate, agreement[(r.candidate.title || '') + '|' + (r.candidate.artist || '')] || 0),
  }));

  const out = {
    query: rawQuery, classified,
    candidates: rankedWithPoints,
    best,
    sourcesUsed: perSource,
    totalCandidates: unique.length,
  };
  if (!opts.noCache) cache.set('track', cacheKey, { query: out.query, candidates: out.candidates.slice(0, 5), best: out.best, totalCandidates: out.totalCandidates });
  return out;
}

/** Resolve a Spotify/YouTube/Apple/Deezer/SoundCloud URL to a track. */
async function resolveUrl(urlInfo, opts = {}) {
  const map = { spotify: 'spotify', youtube: 'youtube', apple: 'apple-music', deezer: 'deezer', soundcloud: 'soundcloud', bandcamp: 'bandcamp', jiosaavn: 'jiosaavn' };
  const entry = registry.get(map[urlInfo.platform]);
  const empty = { query: urlInfo.url, classified: { kind: 'url', url: urlInfo }, candidates: [], best: null, sourcesUsed: [] };
  if (!entry || !entry.enabled || !entry.adapter.lookup) {
    return Object.assign(empty, { note: 'no lookup adapter for ' + urlInfo.platform });
  }
  const keyNames = String(entry.META.needsKey || '').match(/[A-Z][A-Z0-9_]{2,}/g) || [];
  try {
    const track = await entry.adapter.lookup(urlInfo.url, opts);
    if (!track) {
      const missing = keyNames.filter((k) => !process.env[k]);
      const note = keyNames.length && missing.length === keyNames.length
        ? 'auth_required: set ' + keyNames.join(' / ') + ' in .env to resolve ' + urlInfo.platform + ' URLs'
        : 'url did not resolve';
      return Object.assign(empty, {
        sourcesUsed: [{ sourceId: entry.id, status: missing.length ? 'auth_required' : 'ok', count: 0 }],
        note,
      });
    }
    track.source = entry.id;
    const classified = { kind: 'text', raw: (track.title || '') + ' ' + (track.artist || ''), title: track.title, artist: track.artist };
    const { best, ranked } = bestMatch(classified, [track]);
    return { query: urlInfo.url, classified: { kind: 'url', url: urlInfo }, candidates: ranked, best, sourcesUsed: [{ sourceId: entry.id, status: 'ok', count: 1 }] };
  } catch (err) {
    return Object.assign(empty, { note: String((err && err.message) || err).slice(0, 160) });
  }
}

/** Lyrics-fragment search across lyric indexes, then verify artist/title. */
async function searchByLyricsFragment(fragment, opts = {}) {
  // Fragment search needs a real lyric index — generic lyric-site search is too loose.
  const FRAGMENT_PROVIDERS = ['genius', 'musixmatch', 'lyricstranslate', 'songmeanings'];
  const providers = registry.lyricsProviders()
    .filter((e) => FRAGMENT_PROVIDERS.includes(e.id) && e.adapter && e.adapter.search)
    .map((e) => ({ id: e.id, name: e.name, META: e.META, search: e.adapter.search }));
  const { results, perSource } = await searchProviders(providers, fragment, Object.assign({}, opts, { limit: 5 }));
  const unique = deduplicate(results);
  // Rank: a result from a lyric index is weak evidence (0.70); a snippet that
  // actually contains the fragment is strong (0.90). Title-stuffing
  // ("Hello From The Other Side" as a song title) is penalized — the
  // canonical recording usually has a different title ("Hello").
  const frag = fragment.toLowerCase();
  const fragWords = new Set(frag.split(/\s+/).filter((w) => w.length > 2));
  const ranked = unique.map((t, idx) => {
    let conf = 0.70;
    if (t.snippet && String(t.snippet).toLowerCase().includes(frag.slice(0, 24))) conf = 0.90;
    const titleWords = String(t.title || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const overlap = titleWords.filter((w) => fragWords.has(w)).length;
    if (fragWords.size > 0 && overlap / fragWords.size >= 0.6) conf *= 0.65;
    conf -= Math.min(0.1, idx * 0.02);
    const extraSources = Math.max(0, (t.sources || []).length - 1);
    conf = Math.min(0.99, conf + Math.min(0.1, extraSources * 0.05));
    conf = Math.round(conf * 100) / 100;
    return { candidate: t, confidence: conf, match: conf >= 0.6, reasons: ['lyric fragment matched'] };
  }).sort((a, b) => b.confidence - a.confidence).filter((r) => r.confidence >= 0.4).slice(0, 10);
  const best = ranked.length && ranked[0].confidence >= 0.75 ? ranked[0] : null;
  return {
    query: fragment, classified: { kind: 'lyrics-fragment', raw: fragment, fragment },
    candidates: ranked, best, sourcesUsed: perSource, totalCandidates: unique.length,
    note: ranked.length ? undefined : 'no lyric index returned a match for this fragment',
  };
}

/** Regional search: try original + romanized variants through regional platforms first. */
async function searchRegional(rawQuery, regionId, opts = {}) {
  const strategy = registry.get(regionId);
  const platOrder = (strategy && strategy.adapter && strategy.adapter.sourceOrder) || ['cokestudio-pk', 'patari', 'jiosaavn', 'gaana', 'saregama'];
  const providers = orderedProviders(platOrder.concat(IDENTIFY_ORDER.filter((id) => !platOrder.includes(id))));
  const variants = romanVariants(rawQuery, 4);
  let all = [];
  const perSource = [];
  for (const v of [rawQuery, ...variants.slice(1)]) {
    const r = await searchProviders(providers, v, opts);
    all = all.concat(r.results);
    perSource.push(...r.perSource);
    if (all.length >= MAX_RESULTS) break;
  }
  const unique = deduplicate(all);
  const classified = classifyQuery(rawQuery);
  const { best, ranked } = bestMatch(classified, unique);
  return { query: rawQuery, region: regionId, classified, candidates: ranked.slice(0, 10), best, sourcesUsed: perSource, totalCandidates: unique.length };
}

module.exports = { searchTrack, searchByLyricsFragment, searchRegional, resolveUrl, classifyQuery };
