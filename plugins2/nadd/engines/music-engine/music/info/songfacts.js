'use strict';
/**
 * Songfacts adapter (music/info).
 *
 * Source: https://www.songfacts.com — stories/meanings/facts behind songs.
 * NEVER returns lyrics; songFacts() extracts permitted facts only
 * (release year, album, writers/producers (best-effort), chart facts, story).
 *
 * Endpoints (all verified live 2026-10-05 from this VM):
 *  - Search: GET https://www.songfacts.com/ajax-processor.php?do=autocomplete&term=<q>
 *      (the site's own header-search source per their /js/script.js; jQuery-UI
 *      style `term` param. NOTE: the legacy /search.php?searchtext=<q> now
 *      serves a 404 page and must NOT be used.)
 *    Responds HTTP 200 with a JSON array of {category, titlestring,
 *    artiststring, ...}; song pages live at /facts/<artiststring>/<titlestring>.
 *    From non-browser sessions the endpoint returns an empty payload, so
 *    search() may honestly return zero results with a note.
 *  - "View all" results page: POST /ajax-processor.php?do=make-url with
 *      body string=<q>&category=songs  (returns a /search/... URL on success).
 *  - Song page: https://www.songfacts.com/facts/<artist>/<song>
 *      (verified live: 200 for /facts/the-weeknd/starboy).
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, anchors, pageTitle, metaContent } = require('../html');

const META = {
  id: 'songfacts',
  name: 'Songfacts',
  type: 'info',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: true,
  apiSupported: false,
  scrapingSupported: true,
  priority: 1,
  needsKey: null,
  baseUrl: 'https://www.songfacts.com',
  enabled: true,
};

const BASE = 'https://www.songfacts.com';
const AUTOCOMPLETE_URL = BASE + '/ajax-processor.php?do=autocomplete';
const MAKE_URL = BASE + '/ajax-processor.php?do=make-url';

/** Parse the autocomplete JSON payload into [{category,title,artist,artiststring,titlestring}]. */
function parseAutocomplete(text) {
  let arr;
  try {
    arr = JSON.parse(text);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const titlestring = String(it.titlestring || '').trim();
    const artiststring = String(it.artiststring || '').trim();
    if (!titlestring || !artiststring) continue;
    out.push({
      category: String(it.category || '').toLowerCase(),
      title: cleanText(it.title || it.label || it.value || titlestring.replace(/-/g, ' ')),
      artist: cleanText(it.artist || artiststring.replace(/-/g, ' ')),
      artiststring,
      titlestring,
    });
  }
  return out;
}

/** Parse a "view all" results page: .songfacts-results li items -> {title, url}. */
function parseResultsPage(html, limit) {
  const out = [];
  if (!html) return out;
  const ulRe = /<ul[^>]*class="[^"]*songfacts-results[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi;
  let m;
  let guard = 0;
  while ((m = ulRe.exec(html)) && guard++ < 5) {
    for (const a of anchors(m[1], limit * 3)) {
      const url = absUrl(BASE, a.href);
      if (!url.startsWith(BASE + '/facts/')) continue;
      if (out.some((r) => r.url === url)) continue;
      out.push({ title: a.text, url, source: 'songfacts' });
      if (out.length >= limit) return out;
    }
  }
  // Fallback: any /facts/ links on the page.
  if (!out.length) {
    for (const a of anchors(html, 500)) {
      const url = absUrl(BASE, a.href);
      if (!url.startsWith(BASE + '/facts/')) continue;
      if (out.some((r) => r.url === url)) continue;
      out.push({ title: a.text, url, source: 'songfacts' });
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function search(query, opts = {}) {
  const q = String(query || '').trim();
  const limit = Math.max(1, Math.min(opts.limit || 10, 25));
  if (!q) return { status: 'error', results: [], note: 'empty query' };

  // 1) Site's own autocomplete endpoint.
  try {
    const r = await fetchText(AUTOCOMPLETE_URL + '?term=' + encodeURIComponent(q), { retries: 0, timeout: 15000 });
    if (r.ok) {
      const items = parseAutocomplete(r.text);
      const results = items
        .filter((i) => i.category === 'songs')
        .slice(0, limit)
        .map((i) => ({
          title: i.title,
          artist: i.artist,
          url: BASE + '/facts/' + i.artiststring + '/' + i.titlestring,
          source: 'songfacts',
        }));
      if (results.length) return { status: 'ok', results, note: 'via songfacts autocomplete' };
    }
  } catch (e) { /* fall through to fallback */ }

  // 2) Fallback: "view all" POST -> results page URL.
  try {
    const m = await fetchText(MAKE_URL, {
      method: 'POST',
      retries: 0,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: 'string=' + encodeURIComponent(q) + '&category=songs',
    });
    const path = (m.ok ? m.text.trim() : '');
    if (path && path.startsWith('/')) {
      const p = await fetchText(BASE + path, { retries: 0, timeout: 15000 });
      if (p.ok) {
        const results = parseResultsPage(p.text, limit);
        if (results.length) return { status: 'ok', results, note: 'via songfacts results page' };
      }
    }
  } catch (e) { /* honest empty below */ }

  return {
    status: 'ok',
    results: [],
    note: 'songfacts search returned no programmatic results from this session ' +
      '(their autocomplete serves empty payloads to non-browser sessions, verified 2026-10-05). ' +
      'songFacts() accepts a direct /facts/<artist>/<song> page URL instead.',
  };
}

/** Best-effort credit ("written by X" / "X produced this track") inside story text. */
function creditAfter(story, verb) {
  const s = story || '';
  let m = new RegExp(verb + '\\s+by\\s+([A-Z][A-Za-z .&\'\\-]{2,80}?)(?:[.,;]|\\s+and\\s+|$)', 'i').exec(s);
  if (m) return m[1].trim();
  if (verb === 'produced') {
    m = /([A-Z][A-Za-z .&'\-]{2,60}?)\s+produced\s+(?:this|the|their)\s+(?:track|song|single|record)/i.exec(s);
    if (m) return m[1].trim();
  }
  if (verb === 'written') {
    m = /([A-Z][A-Za-z .&'\-]{2,60}?)\s+(?:wrote|co-wrote)\s+(?:this|the|their)\s+(?:track|song|single)/i.exec(s);
    if (m) return m[1].trim();
  }
  return null;
}

/** Extract permitted facts from a songfacts /facts/ page. Never lyrics. */
function extractFacts(html, url) {
  const facts = {
    title: null,
    artist: null,
    releaseYear: null,
    album: null,
    writers: null,
    producers: null,
    chartHistory: null,
    awards: null,
    story: null,
  };
  if (!html) return facts;

  let title = metaContent(html, 'og:title') || pageTitle(html);
  title = title.replace(/\s*-\s*Songfacts\s*$/i, '').trim();
  const byM = /^(.+?)\s+by\s+(.+)$/i.exec(title);
  if (byM) {
    facts.title = cleanText(byM[1]);
    facts.artist = cleanText(byM[2]);
  } else if (title) {
    facts.title = cleanText(title);
  }

  // Album block (tags interleaved, e.g. "Album: </b> Starboy (<a ...>2016</a>)")
  // and "Charted: <flags> 2 1" — parse from a tag-stripped copy.
  const flat = cleanText(html);
  const albumM = /Album:\s*([^()]+?)\s*\(\s*(\d{4})\s*\)/i.exec(flat);
  if (albumM) {
    facts.album = albumM[1].trim();
    facts.releaseYear = parseInt(albumM[2], 10);
  }
  const chartM = /Charted:\s*([0-9][0-9 ]*)/i.exec(flat);
  if (chartM) facts.chartHistory = 'Charted: ' + chartM[1].trim().replace(/\s+/g, ' ');

  // Story block: text after "Songfacts®:" up to the next section marker.
  const sm = html.indexOf('Songfacts®:');
  if (sm >= 0) {
    let seg = html.slice(sm + 'Songfacts®:'.length, sm + 'Songfacts®:'.length + 6000);
    const endMarkers = ['You May Also Like', 'id="comments"', '<h2', '<footer'];
    let end = seg.length;
    for (const mk of endMarkers) {
      const i = seg.indexOf(mk);
      if (i >= 0 && i < end) end = i;
    }
    // Keep sentence spacing across block elements before stripping tags.
    const spaced = seg.slice(0, Math.min(end, 4000)).replace(/<\/?(p|br|div|li|h\d)[^>]*>/gi, ' ');
    let story = cleanText(spaced);
    if (story.length > 1200) story = story.slice(0, 1200).trim() + '…';
    facts.story = story || null;
    facts.writers = creditAfter(story, 'written');
    facts.producers = creditAfter(story, 'produced');
  }

  return facts;
}

function normalizeUrl(urlOrId) {
  const s = String(urlOrId || '').trim();
  if (!s) return null;
  if (/^https?:\/\/(www\.)?songfacts\.com\/facts\//i.test(s)) return s;
  if (s.startsWith('/facts/')) return BASE + s;
  return null;
}

async function lookup(urlOrId, opts = {}) {
  const url = normalizeUrl(urlOrId);
  if (!url) return null;
  let r;
  try {
    r = await fetchText(url, { retries: 0, timeout: 20000 });
  } catch (e) {
    return null;
  }
  if (!r.ok) return null;
  const facts = extractFacts(r.text, url);
  return {
    title: facts.title,
    artist: facts.artist,
    album: facts.album,
    releaseYear: facts.releaseYear,
    url,
    story: facts.story,
    sources: [url],
  };
}

async function songFacts(query, opts = {}) {
  let url = opts.url ? normalizeUrl(opts.url) : null;
  if (!url && query) {
    const s = await search(query, { limit: 3 });
    if (s.results && s.results.length) url = s.results[0].url;
  }
  if (!url) {
    return {
      status: 'ok',
      facts: { releaseYear: null, album: null, writers: null, producers: null, chartHistory: null, awards: null, story: null },
      sources: [],
      note: 'no songfacts page found for query; pass opts.url with a /facts/<artist>/<song> URL',
    };
  }
  let r;
  try {
    r = await fetchText(url, { retries: 0, timeout: 20000 });
  } catch (e) {
    return { status: 'timeout', facts: {}, sources: [url], note: 'fetch timed out: ' + url };
  }
  if (!r.ok) {
    return {
      status: r.status === 403 ? 'blocked' : 'error',
      facts: {},
      sources: [url],
      note: 'songfacts page fetch failed (http_' + r.status + '): ' + url,
    };
  }
  const facts = extractFacts(r.text, url);
  return {
    status: 'ok',
    facts: {
      releaseYear: facts.releaseYear,
      album: facts.album,
      writers: facts.writers,
      producers: facts.producers,
      chartHistory: facts.chartHistory,
      awards: facts.awards,
      story: facts.story,
    },
    sources: [url],
    note: 'facts extracted from songfacts page; story truncated; writers/producers are best-effort matches from the story text; lyrics never included',
  };
}

async function health() {
  const t0 = Date.now();
  try {
    const r = await fetchText(BASE + '/', { retries: 0, timeout: 10000 });
    const ms = Date.now() - t0;
    if (r.ok) return { status: 'healthy', latencyMs: ms, note: 'homepage reachable (http_200)' };
    return { status: 'degraded', latencyMs: ms, note: 'homepage http_' + r.status };
  } catch (e) {
    return { status: 'unhealthy', latencyMs: Date.now() - t0, note: String((e && e.message) || e) };
  }
}

module.exports = { META, search, lookup, health, songFacts };
