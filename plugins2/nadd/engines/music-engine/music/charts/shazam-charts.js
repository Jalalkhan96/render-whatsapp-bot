'use strict';
/**
 * Shazam Charts adapter via the public CSV service endpoint, discovered live
 * 2026-10-05 inside Shazam's site payload:
 *   https://www.shazam.com/services/charts/csv/top-200/{country-slug}/
 * Verified: united-states, united-kingdom, world (HTTP 200, "Rank,Artist,Title"
 * CSV with a week-date header). The /charts/* HTML pages themselves render a
 * "not found" shell, so the CSV service is the working route. A desktop Safari
 * UA is required (default fetch UA gets HTTP 405).
 */
const { fetchText } = require('../http');
const { cleanText } = require('../html');

const META = { id:'shazam-charts', name:'Shazam Charts', type:'charts', country:'US',
  languages:['en'], searchSupported:true, directLookupSupported:false,
  apiSupported:false, scrapingSupported:true, priority:5, needsKey:null,
  baseUrl:'https://www.shazam.com', enabled:true };

const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

// Country slugs verified against Shazam's own chart links / live CSV fetches.
const SLUGS = {
  US:'united-states', GB:'united-kingdom', KR:'south-korea', NO:'norway',
  AU:'australia', MX:'mexico', RU:'russia', DK:'denmark', AT:'austria',
  SN:'senegal', SA:'saudi-arabia', HU:'hungary', MA:'morocco',
  GLOBAL:'world', WORLD:'world',
};

function parseCsvLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

function parseEntries(text, country, slug, limit) {
  const lines = text.split(/\r?\n/);
  let date = null, start = 0;
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].trim()) { start = k; break; }
  }
  const dm = /^"([^"]+)"/.exec(lines[start] || '');
  if (dm) date = cleanText(dm[1].replace(/\s*\[performance[^\]]*\]/, ''));
  const entries = [];
  for (let i = start + 1; i < lines.length && entries.length < limit; i++) {
    const line = lines[i].trim();
    if (!line || /^"?rank"?/i.test(line)) continue;
    const f = parseCsvLine(line);
    if (f.length < 3) continue;
    const rank = parseInt(f[0], 10);
    const artist = cleanText(f[1]);
    const title = cleanText(f[2]);
    if (!Number.isFinite(rank) || !title) continue;
    entries.push({
      rank,
      prevRank: null,
      peak: null,
      weeks: null,
      title,
      artist: artist || null,
      country,
      chart: 'Shazam Top 200',
      date,
      url: 'https://www.shazam.com/charts/top-200/' + slug,
    });
  }
  return entries;
}

async function charts(country, opts = {}) {
  const cc = String(country || 'US').toUpperCase();
  const slug = SLUGS[cc];
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 20, 200));
  if (!slug) {
    return { status:'unsupported', entries:[],
      note:'Shazam adapter has no verified country slug for ' + cc +
        ' (verified: ' + Object.keys(SLUGS).join(', ') + ')' };
  }
  const url = 'https://www.shazam.com/services/charts/csv/top-200/' + slug + '/';
  const r = await fetchText(url, { userAgent: SAFARI_UA, retries: 1 });
  if (!r.ok) {
    return { status:'unreachable', entries:[],
      note:'Shazam CSV service unreachable for ' + slug + ' (HTTP ' + r.status + ')' };
  }
  const entries = parseEntries(r.text, cc, slug, limit);
  if (!entries.length) {
    return { status:'source_changed', entries:[],
      note:'Shazam CSV fetched but no chart rows parsed (format changed)' };
  }
  return { status:'ok', entries, note:'Shazam Top 200 (' + slug + ')' };
}

async function search(query, opts = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { status:'ok', results:[], note:'Empty query' };
  const c = await charts(opts.country || 'US', { limit: 200 });
  if (c.status !== 'ok') return { status:c.status, results:[], note:c.note };
  const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 10, 50));
  const results = c.entries.filter(e =>
    ((e.title || '') + ' ' + (e.artist || '')).toLowerCase().includes(q)).slice(0, limit);
  return { status:'ok', results, note: results.length + ' match(es) for "' + query + '" in Shazam Top 200' };
}

async function lookup() { return null; }

async function health() {
  const t0 = Date.now();
  const r = await fetchText('https://www.shazam.com/services/charts/csv/top-200/united-states/',
    { userAgent: SAFARI_UA, retries: 0 });
  if (!r.ok) return { status:'unreachable', latencyMs: Date.now() - t0, note:'HTTP ' + r.status };
  return { status:'ok', latencyMs: r.ms, note:'Shazam CSV chart service reachable' };
}

module.exports = { META, search, lookup, health, charts };
