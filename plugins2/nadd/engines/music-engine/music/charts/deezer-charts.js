'use strict';
/**
 * Deezer Charts adapter via the keyless public API.
 * Verified live 2026-10-05: https://api.deezer.com/chart/0/tracks returns 200
 * with { data: [...] } in chart order (10 tracks). Country-specific chart IDs
 * are Deezer-internal and not officially documented, so the adapter uses the
 * global chart (id 0) for every request and says so in the note.
 */
const { fetchJson } = require('../http');
const { cleanText } = require('../html');

const META = { id:'deezer-charts', name:'Deezer Charts', type:'charts', country:'US',
  languages:['en'], searchSupported:true, directLookupSupported:false,
  apiSupported:true, scrapingSupported:false, priority:7, needsKey:null,
  baseUrl:'https://api.deezer.com', enabled:true };

const CHART_URL = 'https://api.deezer.com/chart/0/tracks';

function parseEntries(data, country, limit) {
  const list = (data && Array.isArray(data.data)) ? data.data : [];
  const entries = [];
  for (let i = 0; i < list.length && entries.length < limit; i++) {
    const t = list[i] || {};
    const title = cleanText(t.title);
    if (!title) continue;
    entries.push({
      rank: i + 1,
      prevRank: null,
      peak: null,
      weeks: null,
      title,
      artist: cleanText(t.artist && t.artist.name) || null,
      country,
      chart: 'Deezer Top Tracks',
      date: null,
      url: t.link || '',
    });
  }
  return entries;
}

async function charts(country, opts = {}) {
  const cc = String(country || 'US').toUpperCase();
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 20, 100));
  const r = await fetchJson(CHART_URL, { retries: 1 });
  if (!r.ok) {
    return { status:'unreachable', entries:[],
      note:'Deezer chart API unreachable (HTTP ' + r.status + (r.error ? ': ' + r.error : '') + ')' };
  }
  const entries = parseEntries(r.data, cc, limit);
  if (!entries.length) {
    return { status:'source_changed', entries:[],
      note:'Deezer chart API returned no tracks (response shape changed)' };
  }
  return { status:'ok', entries,
    note:'Deezer Top Tracks (global chart; country-specific chart IDs are Deezer-internal, requested country: ' + cc + ')' };
}

async function search(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { status:'ok', results:[], note:'Empty query' };
  const c = await charts(opts.country || 'US', { limit: 100 });
  if (c.status !== 'ok') return { status:c.status, results:[], note:c.note };
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 10, 50));
  const results = c.entries.filter(e =>
    ((e.title || '') + ' ' + (e.artist || '')).toLowerCase().includes(q)).slice(0, limit);
  return { status:'ok', results, note: results.length + ' match(es) for "' + query + '" in Deezer Top Tracks' };
}

async function lookup() { return null; }

async function health() {
  const t0 = Date.now();
  const r = await fetchJson(CHART_URL, { retries: 0 });
  if (!r.ok) return { status:'unreachable', latencyMs: Date.now() - t0, note:'HTTP ' + r.status };
  return { status:'ok', latencyMs: r.ms, note:'Deezer chart API reachable' };
}

module.exports = { META, search, lookup, health, charts };
