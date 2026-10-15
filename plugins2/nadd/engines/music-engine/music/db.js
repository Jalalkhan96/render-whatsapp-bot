'use strict';
/**
 * Lightweight JSON database. Tables:
 *   music_tracks, music_artists, music_albums, music_lyrics_sources,
 *   music_lyric_results, music_translations, music_charts, music_trends,
 *   music_identifications, music_releases, music_source_health, music_scrape_runs
 * Stores metadata/ids/urls only — never full copyrighted lyrics, audio or video.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, '..', 'data', 'music-db.json');
const TABLES = [
  'music_tracks', 'music_artists', 'music_albums', 'music_lyrics_sources',
  'music_lyric_results', 'music_translations', 'music_charts', 'music_trends',
  'music_identifications', 'music_releases', 'music_source_health', 'music_scrape_runs',
];

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    db = {};
  }
  for (const t of TABLES) if (!Array.isArray(db[t])) db[t] = [];
  return db;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
  } catch (e) { /* best-effort */ }
}

function uid() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

function insert(table, row) {
  const d = load();
  const r = Object.assign({ id: uid(), created_at: new Date().toISOString() }, row);
  d[table].push(r);
  // keep tables bounded — drop oldest beyond cap
  const caps = { music_scrape_runs: 200, music_trends: 5000, music_charts: 5000, music_identifications: 1000 };
  const cap = caps[table];
  if (cap && d[table].length > cap) d[table] = d[table].slice(d[table].length - cap);
  persist();
  return r;
}

function find(table, predicate, limit = 50) {
  const d = load();
  const out = [];
  for (const r of d[table]) {
    if (predicate(r)) { out.push(r); if (out.length >= limit) break; }
  }
  return out;
}

function upsertTrack(track) {
  const d = load();
  const isrc = track.isrc ? String(track.isrc).toUpperCase() : null;
  let existing = null;
  if (isrc) existing = d.music_tracks.find((t) => t.isrc === isrc);
  if (!existing && track.spotify_id) existing = d.music_tracks.find((t) => t.spotify_id === track.spotify_id);
  if (!existing && track.musicbrainz_id) existing = d.music_tracks.find((t) => t.musicbrainz_id === track.musicbrainz_id);
  if (existing) {
    Object.assign(existing, track, { updated_at: new Date().toISOString() });
    persist();
    return existing;
  }
  return insert('music_tracks', track);
}

function saveLyricResult(row) {
  // row: { track_id, source, source_url, language, availability, license_status, lyrics_hash, metadata }
  return insert('music_lyric_results', row);
}

function saveChartEntries(entries) {
  const d = load();
  for (const e of entries) d.music_charts.push(Object.assign({ id: uid(), created_at: new Date().toISOString() }, e));
  if (d.music_charts.length > 5000) d.music_charts = d.music_charts.slice(d.music_charts.length - 5000);
  persist();
}

function logScrapeRun(run) {
  return insert('music_scrape_runs', run);
}

function saveIdentification(row) {
  return insert('music_identifications', row);
}

function stats() {
  const d = load();
  const out = {};
  for (const t of TABLES) out[t] = d[t].length;
  return out;
}

module.exports = {
  insert, find, upsertTrack, saveLyricResult, saveChartEntries,
  logScrapeRun, saveIdentification, stats, TABLES,
};
