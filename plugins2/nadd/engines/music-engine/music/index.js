'use strict';
/**
 * music-engine — complete Music Intelligence and Song Discovery Engine.
 * Zero dependencies. CommonJS. Node >= 18.
 *
 *   const { MusicManager, registry } = require('./music');
 *   const manager = new MusicManager();
 *   const result = await manager.search('.lyrics Kahani Suno');
 */
const MusicManager = require('./music-manager');
const registry = require('./source-registry');
const searchEngine = require('./search-engine');
const normalizer = require('./query-normalizer');
const matcher = require('./track-matcher');
const ranker = require('./result-ranker');
const deduplicator = require('./deduplicator');
const cache = require('./cache');
const db = require('./db');
const health = require('./health-manager');

module.exports = {
  MusicManager,
  registry,
  searchEngine,
  normalizer,
  matcher,
  ranker,
  deduplicator,
  cache,
  db,
  health,
};
