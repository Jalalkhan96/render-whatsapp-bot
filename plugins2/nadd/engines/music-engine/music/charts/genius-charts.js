'use strict';
/**
 * Genius Charts adapter via the chart JSON API used by Genius's own frontend.
 * Verified live 2026-10-05:
 *   https://genius.com/api/songs/chart?time_period=day&chart_genre=all&per_page=N&page=1
 * returns 200 with response.chart_items[] in rank order (item.title,
 * item.primary_artist_names, item.path). The /charts HTML page itself redirects
 * to a joke 404 page (/c_harts) and the homepage is bot-walled, so the API
 * route is the working one. No prev-rank/peak/weeks data is exposed.
 */
const { fetchJson } = require('../http');
const { cleanText } = require('../html');

const META = { id:'genius-charts', name:'Genius Charts', type:'charts', country:'US',
  languages:['en'], searchSupported:true, directLookupSupported:false,
  apiSupported:true, scrapingSupported:false, priority:8, needsKey:null,
  baseUrl:'https://genius.com', enabled:true };

const API_URL = 'https://genius.com/api/songs/chart';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function parseEntries(data, country, limit) {
  const list = (data && data.response && Array.isArray(data.response.chart_items))
    ? data.response.chart_items : [];
  const entries = [];
  for (let i = 0; i < list.length && entries.length < limit; i++) {
    const item = (list[i] && list[i].item) || {};
    const title = cleanText(item.title);
    if (!title) continue;
    entries.push({
      rank: i + 1,
      prevRank: null,
      peak: null,
      weeks: null,
      title,
      artist: cleanText(item.primary_artist_names) || null,
      country,
      chart: 'Genius Top Songs (daily)',
      date: todayStr(),
      url: item.path ? 'https://genius.com' + item.path : 'https://genius.com',
    });
  }
  return entries;
}

async function charts(country, opts = {}) {
  const cc = String(country || 'US').toUpperCase();
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 20, 50));
  const url = API_URL + '?time_period=day&chart_genre=all&per_page=' + limit + '&page=1';
  const r = await fetchJson(url, { retries: 1 });
  if (!r.ok) {
    return { status:'unreachable', entries:[],
      note:'Genius chart API unreachable (HTTP ' + r.status + (r.error ? ': ' + r.error : '') + ')' };
  }
  const entries = parseEntries(r.data, cc, limit);
  if (!entries.length) {
    return { status:'source_changed', entries:[],
      note:'Genius chart API returned no items (response shape changed)' };
  }
  return { status:'ok', entries, note:'Genius Top Songs daily chart (US/global)' };
}

async function search(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { status:'ok', results:[], note:'Empty query' };
  const c = await charts(opts.country || 'US', { limit: 50 });
  if (c.status !== 'ok') return { status:c.status, results:[], note:c.note };
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 10, 50));
  const results = c.entries.filter(e =>
    ((e.title || '') + ' ' + (e.artist || '')).toLowerCase().includes(q)).slice(0, limit);
  return { status:'ok', results, note: results.length + ' match(es) for "' + query + '" in Genius Top Songs' };
}

async function lookup() { return null; }

async function health() {
  const t0 = Date.now();
  const r = await fetchJson(API_URL + '?time_period=day&chart_genre=all&per_page=1&page=1', { retries: 0 });
  if (!r.ok) return { status:'unreachable', latencyMs: Date.now() - t0, note:'HTTP ' + r.status };
  return { status:'ok', latencyMs: r.ms, note:'Genius chart API reachable' };
}

module.exports = { META, search, lookup, health, charts };
