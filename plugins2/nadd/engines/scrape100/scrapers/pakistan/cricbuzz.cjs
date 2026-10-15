// Cricbuzz — live scores, fixtures & results scraper
// Verified live 2026-10-05: the homepage embeds the site's own public data as
// escaped JSON inside Next.js flight chunks (self.__next_f.push), including
// "matchesList": { matches: [ { match: { matchInfo, matchScore } } ] }.
// The adapter decodes that public embedded JSON — no login, no key.
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BASE = 'https://www.cricbuzz.com';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { headers = {}, timeoutMs = 25000, attempts = 3 } = {}) {
  let lastErr;
  for (let a = 0; a < attempts; a++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return await res.text();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (a < attempts - 1) await sleep(1200 * Math.pow(2, a));
    }
  }
  throw lastErr;
}

// Decode a JS string-literal escape layer (\" \\ \n \uXXXX ...).
function jsUnescape(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/gs, (m, g) => {
    if (g[0] === 'u') return String.fromCharCode(parseInt(g.slice(1), 16));
    switch (g) {
      case 'n': return '\n'; case 't': return '\t'; case 'r': return '\r';
      case 'b': return '\b'; case 'f': return '\f';
      default: return g;
    }
  });
}

function extractMatchesList(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/gs)];
  const clean = chunks.map((c) => jsUnescape(c[1])).join('\n');
  const key = '"matchesList":';
  const idx = clean.indexOf(key);
  if (idx < 0) return null;
  let i = idx + key.length;
  while (clean[i] !== '{') i++;
  let depth = 0, inStr = false, esc = false, j = i;
  for (; j < clean.length; j++) {
    const c = clean[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
    else { if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
  }
  try { return JSON.parse(clean.slice(i, j + 1)); } catch { return null; }
}

function inngs(t) {
  if (!t || !t.inngs1) return '';
  const a = t.inngs1, b = t.inngs2;
  const f = (x) => `${x.runs}/${x.wickets} (${x.overs} ov)`;
  return b ? `${f(a)} & ${f(b)}` : f(a);
}

function matchToRecord(w) {
  const m = w.match || {};
  const mi = m.matchInfo || {};
  const sc = m.matchScore || {};
  const t1 = mi.team1 || {}, t2 = mi.team2 || {};
  const score = [t1.teamSName && `${t1.teamSName} ${inngs(sc.team1Score)}`.trim(),
                 t2.teamSName && `${t2.teamSName} ${inngs(sc.team2Score)}`.trim()]
    .filter(Boolean).join(' vs ') || null;
  const venue = mi.venueInfo ? `${mi.venueInfo.ground || ''}, ${mi.venueInfo.city || ''}`.replace(/^, |, $/g, '') : null;
  return {
    source: 'cricbuzz', category: 'cricket',
    title: `${mi.seriesName || ''} — ${mi.matchDesc || ''}`.replace(/^ — | — $/g, '').trim() || null,
    event: mi.seriesName || null,
    team1: t1.teamName || null,
    team2: t2.teamName || null,
    score,
    status: mi.status || mi.state || null,
    venue: venue || null,
    startTime: mi.startDate ? new Date(Number(mi.startDate)).toISOString() : null,
    url: BASE + '/cricket-match/live-scores',
    metadata: {
      matchId: mi.matchId || null, seriesId: mi.seriesId || null,
      format: mi.matchFormat || null, state: mi.state || null,
      shortStatus: mi.shortStatus || null, matchType: mi.matchType || null,
    },
  };
}

function dedupe(records) {
  const seen = new Set();
  return records.filter((r) => {
    const k = (r.metadata && r.metadata.matchId) || r.title;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function latest(opts = {}) {
  const limit = opts.limit || 30;
  const html = await fetchText(BASE + '/');
  const ml = extractMatchesList(html);
  if (!ml || !ml.matches) throw new Error('Cricbuzz matchesList not found');
  await sleep(1200);
  return dedupe(ml.matches.map(matchToRecord).filter((r) => r.title)).slice(0, limit);
}

async function search(query, opts = {}) {
  const q = String(query || '').toLowerCase();
  const recs = await latest({ ...opts, limit: 60 });
  return recs.filter((r) => ((r.title || '') + ' ' + (r.team1 || '') + ' ' + (r.team2 || '') + ' ' + (r.event || '')).toLowerCase().includes(q)).slice(0, opts.limit || 30);
}

async function scrape(url, opts = {}) {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const ml = extractMatchesList(html);
  if (ml && ml.matches && ml.matches.length) return matchToRecord(ml.matches[0]);
  return {
    source: 'cricbuzz', category: 'cricket',
    title: $('meta[property="og:title"]').attr('content') || $('title').text().trim() || null,
    event: null, team1: null, team2: null, score: null, status: null, venue: null,
    startTime: null, url, metadata: {},
  };
}

function normalize(raw) {
  return {
    source: 'cricbuzz',
    category: 'cricket',
    title: raw.title || null,
    event: raw.event || null,
    team1: raw.team1 || null,
    team2: raw.team2 || null,
    score: raw.score || null,
    status: raw.status || null,
    venue: raw.venue || null,
    startTime: raw.startTime || null,
    url: raw.url || null,
    metadata: { ...(raw.metadata || {}), scrapedAt: new Date().toISOString() },
  };
}

module.exports = {
  id: 'cricbuzz',
  name: 'Cricbuzz',
  country: 'INT',
  category: 'cricket',
  baseUrl: BASE + '/',
  language: 'en',
  enabled: true,
  priority: 42,
  transport: 'json',
  providerRequiredReason: null,
  rateLimit: { delayMs: 1200 },
  limits: { maxPages: 3, maxResults: 30 },
  endpoints: {
    latest: 'https://www.cricbuzz.com/ (public embedded JSON: flight chunks -> "matchesList" -> matches[].match.{matchInfo,matchScore})',
    liveScores: 'https://www.cricbuzz.com/cricket-match/live-scores',
  },
  selectors: {
    embeddedJson: 'self.__next_f.push flight chunks containing "matchesList"',
  },
  schedule: { frequency: 'high' },
  latest,
  search,
  scrape,
  normalize,
};
