'use strict';
/**
 * Daily music scraper — sequential job (spec #68):
 *   01 metadata providers -> 02 lyrics discovery -> 03 Pakistani sources ->
 *   04 Indian/regional -> 05 international releases -> 06 charts ->
 *   07 trending -> 08 song facts -> 09 dedup -> 10 persist -> 11 cleanup
 * One external source at a time. Run via cron:  node music/daily-scraper.js
 */
const MusicManager = require('./music-manager');
const registry = require('./source-registry');
const { runSequential } = require('./scheduler');
const db = require('./db');
const cache = require('./cache');
const logger = require('./logger');

const manager = new MusicManager();

const SEED_QUERIES = {
  metadata: ['Blinding Lights', 'Shape of You', 'Pasoori', 'Afreen Afreen', 'Kahani Suno'],
  pakistan: ['Pasoori', 'Kahani Suno', 'Afreen Afreen', 'Tajdar-e-Haram', 'Tu Jhoom'],
  india: ['Kesariya', 'Apna Time Aayega', 'Tum Hi Ho'],
  international: ['Blinding Lights', 'Shape of You', 'Perfect', 'Despacito', 'Believer'],
};

function adaptersOf(ids) {
  const out = [];
  for (const id of ids) {
    const e = registry.get(id);
    if (e && e.enabled && e.adapter && e.adapter.search) {
      out.push({ id: e.id, name: e.name, META: e.META, search: e.adapter.search });
    }
  }
  return out;
}

async function phase(label, sourceIds, queries, limit) {
  logger.info('--- phase: ' + label + ' (' + sourceIds.length + ' sources) ---');
  const sources = adaptersOf(sourceIds);
  let total = 0;
  await runSequential(sources, async (s) => {
    const items = [];
    for (const q of queries) {
      try {
        const r = await s.search(q, { limit: limit || 5 });
        for (const it of (r && r.results) || []) { it.source = s.id; items.push(it); }
        if ((r && r.status) !== 'ok') break;
      } catch (e) { break; }
    }
    total += items.length;
    return { status: 'ok', results: items };
  });
  logger.info('phase ' + label + ' done: ' + total + ' raw results');
  return total;
}

async function main() {
  const started = Date.now();
  logger.info('daily music scrape started');
  const run = { started_at: new Date().toISOString(), phases: {} };

  const lyricsIds = registry.lyricsProviders().map((e) => e.id);
  const metaIds = ['musicbrainz', 'spotify', 'apple-music', 'deezer', 'youtube', 'lastfm', 'discogs', 'bandcamp', 'jiosaavn'];
  const pkIds = ['cokestudio-pk', 'patari', 'jiosaavn', 'gaana'];
  const inIds = ['jiosaavn', 'gaana', 'saregama', 'hungama', 'raaga'];
  const chartIds = registry.chartProviders().map((e) => e.id);

  run.phases['01_metadata'] = await phase('01 metadata providers', metaIds, SEED_QUERIES.metadata, 5);
  run.phases['02_lyrics'] = await phase('02 lyrics discovery', lyricsIds, SEED_QUERIES.metadata.slice(0, 3), 3);
  run.phases['03_pakistan'] = await phase('03 pakistani sources', pkIds, SEED_QUERIES.pakistan, 5);
  run.phases['04_india_regional'] = await phase('04 indian/regional', inIds, SEED_QUERIES.india, 5);
  run.phases['05_releases'] = (await manager.getNewReleases({})).length;
  run.phases['06_charts'] = (await manager.getCharts('global')).entries.length;
  run.phases['07_trending'] = (await manager.getTrending('global')).trending.length;
  run.phases['08_facts'] = (await manager.getFacts('Blinding Lights The Weeknd')).sources.length;

  // 09 dedup happens inside each phase via manager/db upserts; 10 persist scrape run
  run.finished_at = new Date().toISOString();
  run.took_ms = Date.now() - started;
  db.logScrapeRun(run);

  // 11 cleanup: prune expired cache, rotate logs (logger auto-rotates)
  const pruned = cache.prune();
  logger.info('cleanup: pruned ' + pruned + ' expired cache entries');
  logger.info('daily music scrape finished in ' + Math.round(run.took_ms / 1000) + 's');
}

if (require.main === module) {
  main().catch((e) => { logger.error('daily-scraper', e); process.exit(1); });
}

module.exports = { main };
