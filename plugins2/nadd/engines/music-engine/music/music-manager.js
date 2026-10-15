'use strict';
/**
 * MusicManager — the complete pipeline:
 *   USER QUERY -> normalize -> search/identify -> track match -> artist match ->
 *   album match -> ISRC match -> metadata enrich -> lyrics cascade ->
 *   translation/meaning -> charts/trending -> final normalized result (#100)
 */
const registry = require('./source-registry');
const searchEngine = require('./search-engine');
const { runSequential } = require('./scheduler');
const { classifyQuery } = require('./query-normalizer');
const cache = require('./cache');
const db = require('./db');
const logger = require('./logger');
const { formatDuration } = require('./html');

/** Lyrics cascade priority per spec #93. */
const LYRICS_ORDER = [
  'musixmatch', 'lyricfind', 'genius', 'lyrics-com', 'lyricstranslate',
  'songmeanings', 'azlyrics', 'lyricsbogie', 'lyricsmint', 'lyricsbell',
  'hindisongslyrics', 'lyricsraag', 'lyricsread', 'lets-sing-it', 'songlyrics',
  'lyricsfreak', 'lyricsmode', 'elyrics', 'lyrics-on-demand',
];

function providerList(ids) {
  const out = [];
  for (const id of ids) {
    const e = registry.get(id);
    if (e && e.enabled && e.adapter && e.adapter.search) {
      out.push({ id: e.id, name: e.name, META: e.META, search: e.adapter.search, lookup: e.adapter.lookup });
    }
  }
  return out;
}

function emptyResult(query) {
  return {
    query,
    match: { confidence: 0, title: '', artist: '', album: '', durationMs: 0, releaseDate: '', isrc: '' },
    metadata: { genre: '', language: '', country: '', cover: '' },
    lyrics: { available: false, provider: '', url: '', licenseStatus: '' },
    translations: [],
    meaning: { available: false, summary: '', sources: [] },
    musicLinks: { spotify: '', appleMusic: '', youtube: '', deezer: '', soundcloud: '' },
    charts: [], trending: [],
    sourcesUsed: [], scrapedAt: new Date().toISOString(),
  };
}

function buildMusicLinks(candidates) {
  const links = { spotify: '', appleMusic: '', youtube: '', deezer: '', soundcloud: '' };
  const map = { spotify: 'spotify', 'apple-music': 'appleMusic', youtube: 'youtube', deezer: 'deezer', soundcloud: 'soundcloud' };
  for (const r of candidates || []) {
    const c = r.candidate || r;
    if (c.url && map[c.source] && !links[map[c.source]]) links[map[c.source]] = c.url;
  }
  return links;
}

class MusicManager {
  constructor(opts = {}) {
    this.opts = opts;
    this.enabled = process.env.MUSIC_ENABLED !== 'false';
  }

  /** Full pipeline for a song query. */
  async search(rawQuery, opts = {}) {
    if (!this.enabled) return Object.assign(emptyResult(rawQuery), { note: 'music engine disabled (MUSIC_ENABLED=false)' });
    const res = emptyResult(rawQuery);
    const started = Date.now();

    // 1-3. normalize -> search -> track match
    const found = await searchEngine.searchTrack(rawQuery, opts);
    res.sourcesUsed = found.sourcesUsed || [];
    if (!found.best) {
      res.note = found.note || 'no match found';
      res.candidates = (found.candidates || []).slice(0, 5).map((r) => ({
        title: r.candidate.title, artist: r.candidate.artist, confidence: r.confidence,
      }));
      return res;
    }

    const best = found.best.candidate;
    const conf = found.best.confidence;

    // 4-6. match block
    res.match = {
      confidence: conf,
      title: best.title || '', artist: best.artist || '', album: best.album || '',
      durationMs: best.durationMs || 0, releaseDate: best.releaseDate || '', isrc: best.isrc || '',
      reasons: found.best.reasons || [],
      band: conf >= 0.9 ? 'strong' : conf >= 0.7 ? 'probable' : 'uncertain',
    };
    res.metadata = {
      genre: best.genre || '', language: best.language || '', country: best.country || '',
      cover: best.cover || '',
    };
    res.musicLinks = buildMusicLinks(found.candidates);
    res.candidates = (found.candidates || []).slice(0, 5).map((r) => ({
      title: r.candidate.title, artist: r.candidate.artist, confidence: r.confidence,
    }));

    // persist track (metadata only)
    try {
      db.upsertTrack({
        title: best.title, artist: best.artist, album: best.album,
        duration_ms: best.durationMs, release_date: best.releaseDate, isrc: best.isrc,
        genre: best.genre, language: best.language, cover_url: best.cover,
        spotify_id: best.source === 'spotify' ? best.sourceId : undefined,
        musicbrainz_id: best.source === 'musicbrainz' ? best.sourceId : undefined,
        deezer_id: best.source === 'deezer' ? best.sourceId : undefined,
        youtube_id: best.source === 'youtube' ? best.sourceId : undefined,
      });
    } catch (e) { /* db is best-effort */ }

    // 7-8. lyrics cascade (sequential, stop at first available)
    if (opts.lyrics !== false) {
      res.lyrics = await this.findLyrics(best, opts);
    }

    // 9. translation / meaning (optional, sequential)
    if (opts.translation) {
      res.translations = await this.findTranslations(best, opts.translation);
    }
    if (opts.meaning) {
      res.meaning = await this.getMeaning(best.title + ' ' + best.artist);
    }
    if (opts.charts) {
      res.charts = await this.getCharts({ title: best.title, artist: best.artist });
    }

    res.scrapedAt = new Date().toISOString();
    res.tookMs = Date.now() - started;
    return res;
  }

  /** Lyrics provider cascade — returns link/availability, never full copyrighted text. */
  async findLyrics(track, opts = {}) {
    const q = (track.title || '') + ' ' + (track.artist || '');
    const cacheKey = 'lyrics:' + q.toLowerCase();
    const hit = cache.get('lyrics', cacheKey);
    if (hit) return hit;

    const providers = providerList(LYRICS_ORDER);
    let found = { available: false, provider: '', url: '', licenseStatus: '' };
    const { results, perSource } = await runSequential(providers, async (p) => {
      try {
        const r = await p.search(q, { limit: 3 });
        const items = (r && r.results) || [];
        return { status: (r && r.status) || 'ok', results: items.slice(0, 3), note: r && r.note };
      } catch (err) {
        return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
      }
    }, { resultCap: 10 });

    for (const it of results) {
      if (it.lyricsAvailable || it.lyricsUrl || it.url) {
        found = {
          available: true,
          provider: it.source || '',
          url: it.lyricsUrl || it.url || '',
          licenseStatus: it.licenseStatus || 'link-only',
          excerpt: it.excerpt || undefined,
        };
        break;
      }
    }
    found.sourcesChecked = perSource.map((p) => p.sourceId + ':' + p.status);
    cache.set('lyrics', cacheKey, found);
    // persist availability record (url + license only)
    try {
      db.saveLyricResult({
        source: found.provider, source_url: found.url, language: track.language || '',
        availability: found.available ? 'available' : 'not_found',
        license_status: found.licenseStatus,
      });
    } catch (e) { /* ignore */ }
    return found;
  }

  async findTranslations(track, language) {
    const out = [];
    const providers = registry.translationProviders()
      .filter((e) => e.adapter && e.adapter.translate)
      .map((e) => ({ id: e.id, name: e.name, translate: e.adapter.translate }));
    // Sequential; never generate/distribute a full unauthorized translated copy.
    for (const p of providers) {
      try {
        const r = await p.translate(track, language);
        if (r) out.push(Object.assign({ provider: p.id }, r));
      } catch (e) { logger.error(p.id, e); }
    }
    return out;
  }

  async getArtist(name) {
    const cacheKey = 'artist:' + String(name).toLowerCase();
    const hit = cache.get('artist', cacheKey);
    if (hit) return hit;
    const providers = providerList(['musicbrainz', 'lastfm', 'spotify', 'deezer', 'apple-music', 'jiosaavn']);
    const agg = { name, genres: [], popularTracks: [], albums: [], urls: {}, sources: [] };
    await runSequential(providers, async (p) => {
      try {
        const fn = p.adapter.artistInfo || p.search;
        const r = await fn.call(p.adapter, name, { limit: 5 });
        const items = (r && r.results) || (r && r.artist ? [r.artist] : []);
        if (r && r.artist) Object.assign(agg, r.artist);
        for (const it of items.slice(0, 5)) {
          if (it.title && !agg.popularTracks.find((t) => t.title === it.title)) {
            agg.popularTracks.push({ title: it.title, url: it.url });
          }
          if (it.url && !agg.urls[p.id]) agg.urls[p.id] = it.url;
        }
        agg.sources.push(p.id);
        return { status: (r && r.status) || 'ok', results: [] };
      } catch (err) {
        return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
      }
    });
    agg.popularTracks = agg.popularTracks.slice(0, 10);
    cache.set('artist', cacheKey, agg);
    return agg;
  }

  async getAlbum(name) {
    const cacheKey = 'album:' + String(name).toLowerCase();
    const hit = cache.get('album', cacheKey);
    if (hit) return hit;
    const providers = providerList(['musicbrainz', 'spotify', 'deezer', 'apple-music', 'discogs']);
    let album = null;
    await runSequential(providers, async (p) => {
      try {
        const fn = p.adapter.albumInfo || p.search;
        const r = await fn.call(p.adapter, name, { limit: 3 });
        const item = (r && r.album) || ((r && r.results) || [])[0];
        if (item && !album) {
          album = {
            title: item.title || name, artist: item.artist || item.albumArtist || '',
            releaseDate: item.releaseDate || '', trackCount: item.trackCount || (item.tracks || []).length,
            tracks: (item.tracks || []).slice(0, 40), genre: item.genre || '',
            label: item.label || '', cover: item.cover || '', url: item.url || '',
            source: p.id, sources: [p.id],
          };
        } else if (item && album) {
          if (!album.tracks.length && item.tracks) album.tracks = item.tracks.slice(0, 40);
          album.sources.push(p.id);
        }
        return { status: (r && r.status) || 'ok', results: [] };
      } catch (err) {
        return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
      }
    });
    const out = album || { title: name, notFound: true };
    cache.set('album', cacheKey, out);
    return out;
  }

  /** Song meaning from annotations + community sources; labeled as interpretation unless sourced. */
  async getMeaning(query) {
    const out = { available: false, summary: '', sources: [] };
    const providers = providerList(['genius', 'songmeanings', 'songfacts']);
    await runSequential(providers, async (p) => {
      try {
        const r = await p.search(query, { limit: 2 });
        const items = (r && r.results) || [];
        for (const it of items.slice(0, 2)) {
          if (it.annotation || it.meaning) {
            out.available = true;
            out.summary = (out.summary ? out.summary + '\n\n' : '') + String(it.annotation || it.meaning).slice(0, 600);
            out.sources.push({ provider: p.id, url: it.url || it.lyricsUrl || '', official: !!it.official });
          } else if (it.url) {
            out.sources.push({ provider: p.id, url: it.url, official: false });
          }
        }
        return { status: (r && r.status) || 'ok', results: [] };
      } catch (err) {
        return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
      }
    });
    out.summary = out.summary.slice(0, 1500);
    return out;
  }

  /** Song facts: release, writers, producers, chart history, awards, samples. */
  async getFacts(query) {
    const out = { query, facts: {}, sources: [] };
    const providers = providerList(['songfacts', 'musicbrainz', 'discogs', 'genius', 'whosampled']);
    await runSequential(providers, async (p) => {
      try {
        const r = await p.search(query, { limit: 2 });
        const items = (r && r.results) || [];
        const it = items[0];
        if (it) {
          for (const k of ['releaseDate', 'year', 'writers', 'producers', 'label', 'genre', 'album']) {
            if (it[k] && !out.facts[k]) out.facts[k] = it[k];
          }
          if (it.facts) Object.assign(out.facts, it.facts);
          out.sources.push({ provider: p.id, url: it.url || '' });
        }
        return { status: (r && r.status) || 'ok', results: [] };
      } catch (err) {
        return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
      }
    });
    return out;
  }

  /** Samples / interpolations relationships (no copyrighted audio). */
  async getSamples(query) {
    const out = { query, relationships: [], sources: [] };
    const providers = providerList(['whosampled', 'discogs', 'musicbrainz']);
    await runSequential(providers, async (p) => {
      try {
        const r = await p.search(query, { limit: 3 });
        const items = (r && r.results) || [];
        for (const it of items) {
          if (it.samples || it.relationships) {
            const rels = it.samples || it.relationships;
            for (const rel of rels) out.relationships.push(Object.assign({ via: p.id }, rel));
          }
        }
        if (items[0] && items[0].url) out.sources.push({ provider: p.id, url: items[0].url });
        return { status: (r && r.status) || 'ok', results: [] };
      } catch (err) {
        return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
      }
    });
    return out;
  }

  /** Charts across providers, normalized. */
  async getCharts(country) {
    const cacheKey = 'charts:' + (country || 'global');
    const hit = cache.get('chart', cacheKey);
    if (hit) return hit;
    const providers = registry.chartProviders()
      .filter((e) => e.adapter && (e.adapter.charts || e.adapter.search))
      .map((e) => ({ id: e.id, name: e.name, adapter: e.adapter }));
    const all = [];
    const perSource = [];
    await runSequential(providers, async (p) => {
      try {
        const fn = p.adapter.charts || p.adapter.search;
        const r = await fn.call(p.adapter, country || 'global', { limit: 20 });
        const items = (r && (r.results || r.entries)) || [];
        for (const it of items.slice(0, 20)) {
          it.source = p.id;
          it.country = country || 'global';
          all.push(it);
        }
        perSource.push({ sourceId: p.id, status: (r && r.status) || 'ok', count: items.length });
        return { status: (r && r.status) || 'ok', results: [] };
      } catch (err) {
        perSource.push({ sourceId: p.id, status: 'error', count: 0 });
        return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
      }
    });
    try { db.saveChartEntries(all.slice(0, 200)); } catch (e) { /* ignore */ }
    const out = { country: country || 'global', entries: all.slice(0, 100), sourcesUsed: perSource, at: new Date().toISOString() };
    cache.set('chart', cacheKey, out);
    return out;
  }

  /** Trending: aggregate + crossPlatformScore. */
  async getTrending(country) {
    const cacheKey = 'trending:' + (country || 'global');
    const hit = cache.get('trend', cacheKey);
    if (hit) return hit;
    const charts = await this.getCharts(country);
    const byTrack = new Map();
    const sourceWeight = { 'spotify-charts': 3, 'youtube-trending': 3, 'billboard': 3, 'shazam-charts': 2, 'apple-charts': 2, 'deezer-charts': 1.5, 'official-charts': 2, 'genius-charts': 1 };
    for (const e of charts.entries) {
      const k = ((e.title || '') + '|' + (e.artist || '')).toLowerCase();
      if (!byTrack.has(k)) byTrack.set(k, { title: e.title, artist: e.artist, ranks: {}, score: 0 });
      const t = byTrack.get(k);
      t.ranks[e.source] = e.rank;
      const w = sourceWeight[e.source] || 1;
      const rankScore = e.rank ? Math.max(0, 101 - e.rank) : 0;
      t.score += w * rankScore;
    }
    const trending = [...byTrack.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((t, i) => Object.assign({ trendRank: i + 1, crossPlatformScore: Math.round(t.score) }, t));
    const out = { country: country || 'global', trending, sourcesUsed: charts.sourcesUsed, at: new Date().toISOString() };
    cache.set('trend', cacheKey, out);
    return out;
  }

  /** New releases: check metadata providers for recent releases. */
  async getNewReleases(opts = {}) {
    const providers = providerList(['spotify', 'apple-music', 'deezer', 'musicbrainz', 'jiosaavn']);
    const all = [];
    await runSequential(providers, async (p) => {
      try {
        const fn = p.adapter.newReleases || p.adapter.search;
        const r = await fn.call(p.adapter, opts.country || 'global', { limit: 15 });
        const items = (r && r.results) || [];
        for (const it of items.slice(0, 15)) { it.source = p.id; all.push(it); }
        return { status: (r && r.status) || 'ok', results: [] };
      } catch (err) {
        return { status: 'error', results: [], note: String((err && err.message) || err).slice(0, 160) };
      }
    });
    const { deduplicate } = require('./deduplicator');
    return deduplicate(all).slice(0, 30);
  }

  /**
   * Audio identification. Requires an authorized recognition provider key
   * (ACRCLOUD_* or AUDD_API_TOKEN). Without keys this returns a clear
   * auth_required error — it never fabricates an identification.
   */
  async identifyAudio(audioBuffer, mime, opts = {}) {
    const order = ['acrcloud', 'audd', 'shazam'];
    for (const id of order) {
      const e = registry.get(id);
      if (!e || !e.enabled || !e.adapter || !e.adapter.identify) continue;
      if (e.needsKey && !process.env[e.needsKey.split(',')[0]]) continue;
      try {
        const r = await e.adapter.identify(audioBuffer, mime, opts);
        if (r && r.status === 'ok' && r.track) {
          try { db.saveIdentification({ source: id, confidence: r.confidence, track: r.track.title, artist: r.track.artist }); } catch (e2) { /* ignore */ }
          const enriched = await this.search((r.track.title || '') + ' ' + (r.track.artist || ''), { lyrics: true });
          enriched.identification = { provider: id, confidence: r.confidence };
          return enriched;
        }
        if (r && r.status === 'auth_required') continue;
      } catch (err) { logger.error(id, err); }
    }
    return {
      status: 'auth_required',
      error: 'Audio recognition needs an authorized provider key. Set ACRCLOUD_ACCESS_KEY + ACRCLOUD_SECRET (or AUDD_API_TOKEN) in your .env — see README.',
      providers: order,
    };
  }

  formatDurationMs(ms) {
    return formatDuration(ms);
  }
}

module.exports = MusicManager;
