'use strict';
/**
 * Billboard Hot 100 chart adapter.
 * Source: https://www.billboard.com/charts/hot-100/ (server-rendered HTML,
 * verified live 2026-10-05: rows carry rank/title/artist plus LW/PEAK/WOC stats).
 * Only the US Hot 100 is supported; other countries return 'unsupported'.
 */
const { fetchText } = require('../http');
const { cleanText, absUrl } = require('../html');

const META = { id:'billboard', name:'Billboard', type:'charts', country:'US',
  languages:['en'], searchSupported:true, directLookupSupported:false,
  apiSupported:false, scrapingSupported:true, priority:1, needsKey:null,
  baseUrl:'https://www.billboard.com', enabled:true };

const CHART_URL = 'https://www.billboard.com/charts/hot-100/';

function parseStat(row, label) {
  const re = new RegExp(
    '<span[^>]*>\\s*' + label + '\\s*<\\/span>\\s*<ul[^>]*>\\s*<li[^>]*>\\s*<span[^>]*>\\s*([^<]*?)\\s*<\\/span>', 'i');
  const m = re.exec(row);
  if (!m) return null;
  const n = parseInt(cleanText(m[1]), 10);
  return Number.isFinite(n) ? n : null;
}

function parseEntries(html, country, limit) {
  const entries = [];
  const dateM = /Week of ([A-Za-z]+ \d{1,2}, \d{4})/.exec(html);
  const date = dateM ? dateM[1] : null;
  const rows = html.split('o-chart-results-list-row-container').slice(1);
  for (const row of rows) {
    if (entries.length >= limit) break;
    const rankM = /class="c-label\s+a-font-basic[^"]*"\s*>\s*(\d+)\s*<\/span>/.exec(row);
    const titleM = /<h3 id="title-of-a-story"[^>]*>\s*([\s\S]*?)\s*<\/h3>/.exec(row);
    if (!rankM || !titleM) continue;
    const title = cleanText(titleM[1]);
    if (!title) continue;
    const artistMs = [...row.matchAll(
      /<a href="(https:\/\/www\.billboard\.com\/artist\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
    let artist = artistMs.map(m => cleanText(m[2])).filter(Boolean).join(', ') || null;
    let url = artistMs.length ? absUrl(CHART_URL, artistMs[0][1]) : CHART_URL;
    if (!artist) {
      // some rows render the artist as plain text in the span after the title
      const spanM = /<h3 id="title-of-a-story"[\s\S]*?<\/h3>\s*<span class="c-label\s+a-no-trucate[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(row);
      if (spanM) artist = cleanText(spanM[1]) || null;
    }
    entries.push({
      rank: parseInt(rankM[1], 10),
      prevRank: parseStat(row, 'LW'),
      peak: parseStat(row, 'PEAK'),
      weeks: parseStat(row, 'WEEKS ON CHART'),
      title,
      artist,
      country,
      chart: 'Billboard Hot 100',
      date,
      url,
    });
  }
  return entries;
}

async function charts(country, opts = {}) {
  const cc = String(country || 'US').toUpperCase();
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 20, 100));
  if (cc !== 'US') {
    return { status:'unsupported', entries:[],
      note:'Billboard adapter currently supports the US Hot 100 only (requested: ' + cc + ')' };
  }
  const r = await fetchText(CHART_URL, { retries: 1 });
  if (!r.ok) {
    return { status:'unreachable', entries:[],
      note:'Billboard Hot 100 page unreachable (HTTP ' + r.status + (r.error ? ': ' + r.error : '') + ')' };
  }
  const entries = parseEntries(r.text, cc, limit);
  if (!entries.length) {
    return { status:'source_changed', entries:[],
      note:'Billboard page fetched but chart rows could not be parsed (markup changed)' };
  }
  return { status:'ok', entries, note:'Billboard Hot 100, week of ' + (entries[0].date || 'unknown') };
}

async function search(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { status:'ok', results:[], note:'Empty query' };
  const country = (opts.country || 'US').toUpperCase();
  const c = await charts(country, { limit: 100 });
  if (c.status !== 'ok') return { status:c.status, results:[], note:c.note };
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 10, 50));
  const results = c.entries.filter(e =>
    ((e.title || '') + ' ' + (e.artist || '')).toLowerCase().includes(q)).slice(0, limit);
  return { status:'ok', results, note: results.length + ' match(es) for "' + query + '" in Billboard Hot 100' };
}

async function lookup() { return null; }

async function health() {
  const t0 = Date.now();
  const r = await fetchText(CHART_URL, { retries: 0 });
  if (!r.ok) return { status:'unreachable', latencyMs: Date.now() - t0, note:'HTTP ' + r.status };
  return { status:'ok', latencyMs: r.ms, note:'Billboard Hot 100 page reachable' };
}

module.exports = { META, search, lookup, health, charts };
