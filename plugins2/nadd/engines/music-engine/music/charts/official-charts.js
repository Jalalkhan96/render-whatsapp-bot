'use strict';
/**
 * Official Charts (UK) adapter.
 * Source: https://www.officialcharts.com/charts/singles-chart/ (server-rendered
 * HTML, verified live 2026-10-05). Rows carry rank, title, artist, last-week,
 * peak and weeks-on-chart. The singles chart is UK-only; other countries
 * return 'unsupported'.
 */
const { fetchText } = require('../http');
const { cleanText, absUrl } = require('../html');

const META = { id:'official-charts', name:'Official Charts', type:'charts', country:'GB',
  languages:['en'], searchSupported:true, directLookupSupported:false,
  apiSupported:false, scrapingSupported:true, priority:6, needsKey:null,
  baseUrl:'https://www.officialcharts.com', enabled:true };

const CHART_URL = 'https://www.officialcharts.com/charts/singles-chart/';

function intOrNull(s) {
  const n = parseInt(String(s || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function parseEntries(html, country, limit) {
  const entries = [];
  const dateM = /<p class="text-brand-cobalt[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/p>/.exec(html);
  const date = dateM ? cleanText(dateM[1]).replace(/\s+/g, ' ') : null;
  const rows = html.split('"position"><span').slice(1);
  for (const row of rows) {
    if (entries.length >= limit) break;
    const rankM = /<strong>(\d+)<\/strong>/.exec(row);
    if (!rankM) continue;
    const nameM = /<a href="([^"]+)" class="chart-name[^"]*"[^>]*>([\s\S]{0,600}?)<\/a>/.exec(row);
    if (!nameM) continue;
    const titleSpans = [...nameM[2].matchAll(/<span>([^<]+)<\/span>/g)];
    const title = cleanText(titleSpans.length ? titleSpans[titleSpans.length - 1][1] : '');
    if (!title) continue;
    const artistM = /class="chart-artist[^"]*"[^>]*><span>([^<]+)<\/span>/.exec(row);
    const lwM = /title="Last week">LW:\s*<span[^>]*>([^<]+)<\/span>/.exec(row);
    const peakM = /<li class="peak[^"]*"[^>]*>Peak:\s*<span[^>]*>(\d+)<\/span>/.exec(row);
    const wksM = /<li class="weeks[^"]*"[^>]*>Weeks:\s*<span[^>]*>(\d+)<\/span>/.exec(row);
    entries.push({
      rank: parseInt(rankM[1], 10),
      prevRank: lwM ? intOrNull(lwM[1]) : null,
      peak: peakM ? parseInt(peakM[1], 10) : null,
      weeks: wksM ? parseInt(wksM[1], 10) : null,
      title,
      artist: artistM ? cleanText(artistM[1]) : null,
      country,
      chart: 'Official Singles Chart Top 100',
      date,
      url: absUrl(CHART_URL, nameM[1]),
    });
  }
  return entries;
}

async function charts(country, opts = {}) {
  const cc = String(country || 'GB').toUpperCase();
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 20, 100));
  if (cc !== 'GB' && cc !== 'UK') {
    return { status:'unsupported', entries:[],
      note:'Official Charts adapter covers the UK Singles Chart only (requested: ' + cc + ')' };
  }
  const r = await fetchText(CHART_URL, { retries: 1 });
  if (!r.ok) {
    return { status:'unreachable', entries:[],
      note:'Official Charts page unreachable (HTTP ' + r.status + (r.error ? ': ' + r.error : '') + ')' };
  }
  const entries = parseEntries(r.text, 'GB', limit);
  if (!entries.length) {
    return { status:'source_changed', entries:[],
      note:'Official Charts page fetched but chart rows could not be parsed (markup changed)' };
  }
  return { status:'ok', entries, note:'Official Singles Chart Top 100 (UK)' };
}

async function search(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { status:'ok', results:[], note:'Empty query' };
  const c = await charts(opts.country || 'GB', { limit: 100 });
  if (c.status !== 'ok') return { status:c.status, results:[], note:c.note };
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 10, 50));
  const results = c.entries.filter(e =>
    ((e.title || '') + ' ' + (e.artist || '')).toLowerCase().includes(q)).slice(0, limit);
  return { status:'ok', results, note: results.length + ' match(es) for "' + query + '" in Official Singles Chart' };
}

async function lookup() { return null; }

async function health() {
  const t0 = Date.now();
  const r = await fetchText(CHART_URL, { retries: 0 });
  if (!r.ok) return { status:'unreachable', latencyMs: Date.now() - t0, note:'HTTP ' + r.status };
  return { status:'ok', latencyMs: r.ms, note:'Official Charts singles page reachable' };
}

module.exports = { META, search, lookup, health, charts };
