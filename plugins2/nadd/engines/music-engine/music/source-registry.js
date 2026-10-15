'use strict';
/**
 * Source registry — every source from the spec catalog is represented here.
 * Adapters are loaded lazily with graceful degradation: a missing or broken
 * adapter file is reported as disabled, never crashes the engine.
 * Priorities follow spec #93 and can be overridden via MUSIC_PRIORITY_OVERRIDES.
 */

// [dir, file] pairs for every adapter in the catalog
const ADAPTER_PATHS = [
  // ---- lyrics (19) ----
  ['lyrics', 'genius'], ['lyrics', 'musixmatch'], ['lyrics', 'lyricfind'],
  ['lyrics', 'lyrics-com'], ['lyrics', 'azlyrics'], ['lyrics', 'songmeanings'],
  ['lyrics', 'lyricstranslate'], ['lyrics', 'lets-sing-it'], ['lyrics', 'songlyrics'],
  ['lyrics', 'lyricsfreak'], ['lyrics', 'lyricsmode'], ['lyrics', 'elyrics'],
  ['lyrics', 'lyrics-on-demand'], ['lyrics', 'lyricsbogie'], ['lyrics', 'lyricsmint'],
  ['lyrics', 'lyricsbell'], ['lyrics', 'hindisongslyrics'], ['lyrics', 'lyricsraag'],
  ['lyrics', 'lyricsread'],
  // ---- metadata (12) ----
  ['metadata', 'musicbrainz'], ['metadata', 'discogs'], ['metadata', 'spotify'],
  ['metadata', 'apple-music'], ['metadata', 'deezer'], ['metadata', 'tidal'],
  ['metadata', 'lastfm'], ['metadata', 'amazon-music'], ['metadata', 'youtube'],
  ['metadata', 'youtube-music'], ['metadata', 'soundcloud'], ['metadata', 'bandcamp'],
  // ---- recognition (5) ----
  ['recognition', 'shazam'], ['recognition', 'soundhound'], ['recognition', 'acrcloud'],
  ['recognition', 'audd'], ['recognition', 'musipedia'],
  // ---- charts (8) ----
  ['charts', 'billboard'], ['charts', 'spotify-charts'], ['charts', 'apple-charts'],
  ['charts', 'youtube-trending'], ['charts', 'shazam-charts'], ['charts', 'official-charts'],
  ['charts', 'deezer-charts'], ['charts', 'genius-charts'],
  // ---- south asian / regional platforms (9) ----
  ['regional-platforms', 'gaana'], ['regional-platforms', 'jiosaavn'],
  ['regional-platforms', 'hungama'], ['regional-platforms', 'raaga'],
  ['regional-platforms', 'wynk'], ['regional-platforms', 'saregama'],
  ['regional-platforms', 'bollywood-hungama'], ['regional-platforms', 'cokestudio-pk'],
  ['regional-platforms', 'patari'],
  // ---- other music information (2) ----
  ['info', 'songfacts'], ['info', 'whosampled'],
  // ---- translation (2) ----
  ['translation', 'lyricstranslate'], ['translation', 'musixmatch'],
  // ---- regional strategy modules (7) ----
  ['regional', 'pakistan'], ['regional', 'india'], ['regional', 'punjabi'],
  ['regional', 'urdu'], ['regional', 'pashto'], ['regional', 'bengali'],
  ['regional', 'south-indian'],
];

let overrides = {};
try {
  overrides = JSON.parse(process.env.MUSIC_PRIORITY_OVERRIDES || '{}');
} catch (e) { overrides = {}; }

const registry = [];
const byId = {};

for (const [dir, file] of ADAPTER_PATHS) {
  const rel = './' + dir + '/' + file;
  let adapter = null;
  let loadError = null;
  try {
    adapter = require(rel);
  } catch (e) {
    loadError = String((e && e.message) || e).slice(0, 160);
  }
  const META = (adapter && adapter.META) || {};
  const id = META.id || file;
  const entry = {
    id,
    file: rel,
    name: META.name || file,
    type: META.type || dir,
    dir,
    META,
    adapter,
    priority: overrides[id] != null ? overrides[id] : (META.priority != null ? META.priority : 50),
    enabled: !!adapter && META.enabled !== false,
    loadError,
    needsKey: META.needsKey || null,
  };
  if (loadError) { entry.enabled = false; entry.note = 'adapter failed to load'; }
  registry.push(entry);
  byId[id] = entry;
}

function get(id) { return byId[id]; }

function byType(type, opts = {}) {
  return registry
    .filter((e) => e.type === type && (opts.includeDisabled || e.enabled))
    .sort((a, b) => a.priority - b.priority);
}

function lyricsProviders() { return byType('lyrics'); }
function metadataProviders() { return byType('metadata'); }
function recognitionProviders() { return byType('recognition'); }
function chartProviders() { return byType('charts'); }
function regionalPlatforms() { return byType('regional-platforms'); }
function translationProviders() { return byType('translation'); }
function regionalStrategies() { return byType('regional'); }

function list() {
  return registry.map((e) => ({
    id: e.id, name: e.name, type: e.type, priority: e.priority,
    enabled: e.enabled, needsKey: e.needsKey,
    searchSupported: !!e.META.searchSupported,
    apiSupported: !!e.META.apiSupported, scrapingSupported: !!e.META.scrapingSupported,
    loadError: e.loadError || undefined,
  }));
}

module.exports = {
  ADAPTER_PATHS, registry, get, byType,
  lyricsProviders, metadataProviders, recognitionProviders, chartProviders,
  regionalPlatforms, translationProviders, regionalStrategies, list,
};
