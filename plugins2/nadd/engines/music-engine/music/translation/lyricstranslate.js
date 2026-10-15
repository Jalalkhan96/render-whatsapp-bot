'use strict';
/**
 * LyricsTranslate adapter (music/translation) — LINK ONLY.
 *
 * Never returns a full translated copy. translate() resolves (or attempts to
 * resolve) the song's translation page for the target language and returns
 * {available, url, language, excerpt?, summary?, note}.
 *
 * Live verification 2026-10-05 from this VM: lyricstranslate.com serves a
 * Cloudflare "Just a moment..." challenge (HTTP 403) to non-browser clients,
 * including https://lyricstranslate.com/en/search?query=<q> — the path itself
 * is confirmed (the challenge is served AT that path, not a 404), but no
 * programmatic search results can be obtained. translate() therefore returns
 * an honest blocked note with the search URL for manual use.
 *
 * Their translation pages look like /en/<song>-lyrics-<lang>-translation.html
 * — the adapter only ever uses URLs parsed from fetched result pages, never
 * constructed guesses.
 *
 * NOTE: music/lyrics/lyricstranslate.js is owned by another worker and may
 * not exist yet. It is required LAZILY inside translate() with try/catch;
 * the self-contained direct logic below is the primary path.
 */
const { fetchText } = require('../http');
const { cleanText, absUrl, anchors } = require('../html');

const META = {
  id: 'lyricstranslate-translation',
  name: 'LyricsTranslate (Translation)',
  type: 'translation',
  country: 'US',
  languages: ['en'],
  searchSupported: true,
  directLookupSupported: true,
  apiSupported: false,
  scrapingSupported: true,
  priority: 1,
  needsKey: null,
  baseUrl: 'https://lyricstranslate.com',
  enabled: true,
};

const BASE = 'https://lyricstranslate.com';
const BLOCKED_NOTE =
  'LyricsTranslate is behind Cloudflare bot protection (HTTP 403 from this ' +
  'environment, verified 2026-10-05); the translation page cannot be resolved ' +
  'programmatically. Open the URL below in a browser to find the translation.';

function searchUrlFor(title, artist) {
  return BASE + '/en/search?query=' + encodeURIComponent([title, artist].filter(Boolean).join(' ').trim());
}

/**
 * Pick a translation-page link for the target language out of parsed anchors.
 * Only matches real "-translation.html" hrefs from the result page.
 */
function findTranslationLink(html, language) {
  const lang = String(language || '').toLowerCase().trim();
  if (!lang) return null;
  const code2 = lang.length === 2 ? lang : null;
  const cands = [];
  for (const a of anchors(html, 600)) {
    const url = absUrl(BASE, a.href);
    if (!/-translation\.html?(\?|#|$)/i.test(url)) continue;
    const hay = (url + ' ' + a.text).toLowerCase();
    const langHit = code2
      ? hay.includes('-' + code2 + '-') || hay.includes(code2 + '-translation')
      : hay.includes(lang);
    if (!langHit) continue;
    cands.push({ url, text: a.text });
  }
  return cands.length ? cands[0] : null;
}

async function search(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return { status: 'error', results: [], note: 'empty query' };
  const url = searchUrlFor(q, '');
  let r;
  try {
    r = await fetchText(url, { retries: 0, timeout: 20000 });
  } catch (e) {
    return { status: 'timeout', results: [], note: 'fetch timed out: ' + url };
  }
  if (!r.ok) {
    return { status: r.status === 403 ? 'blocked' : 'error', results: [], note: BLOCKED_NOTE };
  }
  const results = [];
  for (const a of anchors(r.text, 600)) {
    const link = absUrl(BASE, a.href);
    if (!/-translation\.html?(\?|#|$)/i.test(link)) continue;
    results.push({ title: a.text, url: link, source: 'lyricstranslate' });
    if (results.length >= 15) break;
  }
  return {
    status: 'ok',
    results,
    note: results.length ? 'translation pages found in search results' : 'no translation links parsed from search results',
  };
}

async function lookup(urlOrId, opts = {}) {
  return null;
}

async function translate(track, lang, opts = {}) {
  const title = track && track.title ? String(track.title).trim() : '';
  const artist = track && track.artist ? String(track.artist).trim() : '';
  const language = String(lang || '').trim() || 'unknown';
  const url = searchUrlFor(title, artist);

  // 1) Lazy sibling enhancement — owned by another worker; may not exist.
  try {
    const sib = require('../lyrics/lyricstranslate');
    if (sib && typeof sib.search === 'function') {
      const s = await sib.search([title, artist].filter(Boolean).join(' '), opts || {});
      const hit = s && s.results && s.results.find((r) => /-translation\.html?/i.test(r.url || ''));
      if (hit && hit.url) {
        return {
          available: true,
          url: hit.url,
          language,
          excerpt: typeof hit.excerpt === 'string' && hit.excerpt ? hit.excerpt.slice(0, 160) : undefined,
          summary: typeof hit.summary === 'string' ? hit.summary : undefined,
          note: 'translation page resolved via sibling lyrics adapter; link only',
        };
      }
    }
  } catch (e) { /* sibling unavailable — fall through to self-contained logic */ }

  // 2) Self-contained: fetch the search page, look for a target-lang link.
  let r;
  try {
    r = await fetchText(url, { retries: 0, timeout: 20000 });
  } catch (e) {
    return { available: false, url, language, note: 'search fetch timed out; ' + BLOCKED_NOTE };
  }
  if (!r.ok) {
    return {
      available: false,
      url,
      language,
      note: 'search fetch failed (http_' + r.status + '); ' + BLOCKED_NOTE,
    };
  }
  const link = findTranslationLink(r.text, language);
  if (link) {
    return {
      available: true,
      url: link.url,
      language,
      note: 'translation page found for "' + language + '" in search results; link only (no translated text copied)',
    };
  }
  return {
    available: false,
    url,
    language,
    note: 'no "' + language + '" translation link found in search results; open the URL to browse translations manually',
  };
}

async function health() {
  const t0 = Date.now();
  try {
    const r = await fetchText(BASE + '/en/search?query=test', { retries: 0, timeout: 15000 });
    const ms = Date.now() - t0;
    if (r.status === 403) return { status: 'blocked', latencyMs: ms, note: BLOCKED_NOTE };
    if (r.ok) return { status: 'healthy', latencyMs: ms, note: 'search page reachable' };
    return { status: 'degraded', latencyMs: ms, note: 'http_' + r.status };
  } catch (e) {
    return { status: 'unhealthy', latencyMs: Date.now() - t0, note: String((e && e.message) || e) };
  }
}

module.exports = { META, search, lookup, health, translate };
