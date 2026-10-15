'use strict';
/**
 * Apple Music Charts adapter via the public iTunes RSS feed generator.
 * Verified live 2026-10-05: https://itunes.apple.com/us/rss/topsongs/limit=50/json
 * returns 200 with feed.entry[] (rank = position). The two-letter country code
 * is swappable (us/gb/in/ae/de verified); some territories (e.g. pk) return an
 * empty feed, which is reported honestly.
 */
const { fetchJson } = require('../http');
const { cleanText } = require('../html');

const META = { id:'apple-charts', name:'Apple Music Charts', type:'charts', country:'US',
  languages:['en'], searchSupported:true, directLookupSupported:false,
  apiSupported:true, scrapingSupported:false, priority:3, needsKey:null,
  baseUrl:'https://itunes.apple.com', enabled:true };

function linkHref(entry) {
  const l = entry && entry.link;
  const arr = Array.isArray(l) ? l : (l ? [l] : []);
  for (const x of arr) {
    if (x && x.attributes && x.attributes.href) return x.attributes.href;
  }
  return (entry && entry.id && entry.id.label) || '';
}

function parseEntries(data, country, limit) {
  const feed = (data && data.feed) || {};
  const raw = feed.entry;
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const date = feed.updated && feed.updated.label ? String(feed.updated.label).slice(0, 10) : null;
  const entries = [];
  for (let i = 0; i < list.length && entries.length < limit; i++) {
    const e = list[i] || {};
    const title = cleanText(e['im:name'] && e['im:name'].label);
    if (!title) continue;
    entries.push({
      rank: i + 1,
      prevRank: null,
      peak: null,
      weeks: null,
      title,
      artist: cleanText(e['im:artist'] && e['im:artist'].label) || null,
      country,
      chart: 'Apple Music Top Songs',
      date,
      url: linkHref(e),
    });
  }
  return entries;
}

async function charts(country, opts = {}) {
  const cc = String(country || 'US').toLowerCase();
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 20, 200));
  const url = 'https://itunes.apple.com/' + encodeURIComponent(cc) + '/rss/topsongs/limit=' + limit + '/json';
  const r = await fetchJson(url, { retries: 1 });
  if (!r.ok) {
    return { status:'unreachable', entries:[],
      note:'Apple RSS feed unreachable for country ' + cc.toUpperCase() + ' (HTTP ' + r.status + ')' };
  }
  const entries = parseEntries(r.data, cc.toUpperCase(), limit);
  if (!entries.length) {
    return { status:'ok', entries:[],
      note:'Apple RSS feed returned no songs for country ' + cc.toUpperCase() + ' (feed may be empty for this territory)' };
  }
  return { status:'ok', entries, note:'Apple Music Top Songs (' + cc.toUpperCase() + ')' };
}

async function search(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { status:'ok', results:[], note:'Empty query' };
  const c = await charts(opts.country || 'US', { limit: 100 });
  if (c.status !== 'ok') return { status:c.status, results:[], note:c.note };
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 10, 50));
  const results = c.entries.filter(e =>
    ((e.title || '') + ' ' + (e.artist || '')).toLowerCase().includes(q)).slice(0, limit);
  return { status:'ok', results, note: results.length + ' match(es) for "' + query + '" in Apple Music Top Songs' };
}

async function lookup() { return null; }

async function health() {
  const t0 = Date.now();
  const r = await fetchJson('https://itunes.apple.com/us/rss/topsongs/limit=1/json', { retries: 0 });
  if (!r.ok) return { status:'unreachable', latencyMs: Date.now() - t0, note:'HTTP ' + r.status };
  const raw = r.data && r.data.feed && r.data.feed.entry;
  const n = Array.isArray(raw) ? raw.length : (raw ? 1 : 0);
  return n > 0
    ? { status:'ok', latencyMs: r.ms, note:'Apple RSS topsongs feed reachable' }
    : { status:'source_changed', latencyMs: r.ms, note:'Feed reachable but returned no entries' };
}

module.exports = { META, search, lookup, health, charts };
