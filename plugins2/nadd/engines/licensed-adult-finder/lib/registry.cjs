'use strict';
/* Source registry. Official developer APIs ONLY.
 * Anything not in this registry is refused — unknown is never treated as free.
 * Anime / hentai / doujinshi / cartoon sources are PERMANENTLY excluded:
 * blind results from those pools risk underage-looking sexualized content.
 * This is a standing rule, not a preference. */

const BANNED_KINDS = ['hentai', 'anime', 'doujinshi', 'cartoon', 'manga'];
const BANNED_QUERY_TERMS = ['hentai', 'doujinshi', 'anime', 'manga', 'loli', 'shota', 'yaoi', 'yuri', 'cartoon', '3d hentai'];

const SOURCES = [
  {
    id: 'eporner',
    name: 'Eporner',
    kind: 'official-api',
    base: 'https://www.eporner.com/api/v2/video/',
    docs: 'https://www.eporner.com/api/v2/',
    auth: 'none',
    signup: null,
    rate_limit_ms: 1200,
    status: 'verified-live',
    verified_at: '2026-10-06',
    methods: ['search', 'id'],
    content: 'video',
    terms: 'https://www.eporner.com/terms/',
    notes: 'Official REST API published by Eporner for webmasters. No key required. ' +
           'This tool uses it for metadata search + official links only.',
  },
];

function validateQuery(q) {
  const low = String(q || '').toLowerCase();
  for (const t of BANNED_QUERY_TERMS) {
    if (low.includes(t)) {
      return { ok: false, error: 'Query refused: anime/hentai/doujinshi terms are permanently excluded from this tool.' };
    }
  }
  return { ok: true };
}

function register(source) {
  if (!source || !source.id || !source.base) return { ok: false, error: 'invalid source entry' };
  const low = ((source.name || '') + ' ' + (source.kind || '') + ' ' + (source.notes || '')).toLowerCase();
  for (const k of BANNED_KINDS) {
    if (low.includes(k)) return { ok: false, error: 'refused: ' + k + ' sources are permanently excluded' };
  }
  if (source.kind !== 'official-api') return { ok: false, error: 'refused: only official developer APIs are accepted (no scrapers)' };
  if (SOURCES.some(s => s.id === source.id)) return { ok: false, error: 'source id already registered' };
  SOURCES.push(source);
  return { ok: true };
}

function list() { return SOURCES.map(s => ({ ...s })); }
function get(id) { return SOURCES.find(s => s.id === id) || null; }

module.exports = { SOURCES, BANNED_KINDS, BANNED_QUERY_TERMS, list, get, register, validateQuery };
