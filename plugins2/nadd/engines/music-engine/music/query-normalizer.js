'use strict';
/**
 * Query normalization:
 * - case / unicode / apostrophes / punctuation / whitespace
 * - diacritics and common transliteration variants (Roman Urdu/Hindi/Punjabi)
 * - version tags kept SEPARATE so "Kahani Suno" != "Kahani Suno 2.0"
 * - ISRC / URL classification
 */

const VERSION_TAGS = [
  'remix', 'live', 'acoustic', 'unplugged', 'sped up', 'sped-up', 'speed up',
  'slowed', 'slowed + reverb', 'nightcore', 'radio edit', 'clean', 'explicit',
  'instrumental', 'karaoke', 'cover', 'demo', 'extended', 'original mix',
  'club mix', 'vip', 'flip', 'edit', 'rework', 'mashup', 'lofi', 'lo-fi',
  '8d', '10d', 'bass boosted', 'daycore', 'phonk', 'slowed reverb',
];

const VERSION_SPLIT_RE = /\s*[(\[\-–—]\s*(.+?)\s*[)\]]?\s*$/;

function stripDiacritics(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function unifyQuotes(s) {
  return String(s || '')
    .replace(/[\u2018\u2019\u02bc\u02bb`´]/g, "'")
    .replace(/[\u201c\u201d«»]/g, '"');
}

/** Core normalization: case, unicode, punctuation, spaces. */
function normalize(str, opts = {}) {
  let s = String(str || '');
  s = unifyQuotes(s);
  s = s.normalize('NFC');
  if (opts.stripDiacritics !== false) s = stripDiacritics(s);
  s = s.toLowerCase();
  // unify unicode dashes to ASCII hyphen before punctuation stripping
  s = s.replace(/[‐‑‒–—―−]/g, '-');
  // keep letters/numbers/spaces and a few meaningful separators
  s = s.replace(/[^\p{L}\p{N}\s.'&/-]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Split trailing "(...)" / "- ..." version tag from a title. */
function splitVersion(title) {
  const out = { base: String(title || '').trim(), versions: [] };
  let base = out.base;
  let guard = 0;
  while (guard++ < 4) {
    const m = VERSION_SPLIT_RE.exec(base);
    if (!m) break;
    const tag = normalize(m[1]);
    const known = VERSION_TAGS.some((t) => tag.includes(t)) || /2\.0|v2|part\s*2/i.test(tag);
    if (known) {
      out.versions.push(tag);
      base = base.slice(0, m.index).trim();
    } else break;
  }
  // bare trailing version token ("Kahani Suno 2.0", "Blinding Lights remix" — no brackets)
  const bare = /\s+(2\.0|v\s*2|part\s*2|pt\.?\s*2|vol\.?\s*\d+|20\d\d\s+remaster|remaster\s+20\d\d|remix|remixes|live|acoustic|unplugged|sped\s*up|slowed|nightcore|radio\s*edit|clean|explicit|instrumental|instrumentals|karaoke|demo|extended|cover|mashup|lofi|lo[-\s]?fi|8d|vip|flip|edit|rework)$/i.exec(base);
  if (bare) {
    out.versions.push(normalize(bare[1]));
    base = base.slice(0, bare.index).trim();
  }
  out.base = base;
  return out;
}

/** Common transliteration variant pairs for South Asian queries. */
const TRANSLIT_PAIRS = [
  ['aa', 'a'], ['ee', 'i'], ['oo', 'u'], ['ou', 'u'], ['ph', 'f'],
  ['kh', 'k'], ['gh', 'g'], ['th', 't'], ['dh', 'd'], ['bh', 'b'],
  ['sh', 's'], ['ch', 'c'], ['zh', 'z'], ['ai', 'ae'], ['ay', 'ai'],
];

/** Generate a small set of romanized spelling variants (capped). */
function romanVariants(str, max = 8) {
  const base = normalize(str);
  const variants = new Set([base]);
  const words = base.split(' ');
  // word-level single substitutions
  for (const w of words) {
    for (const [a, b] of TRANSLIT_PAIRS) {
      if (w.includes(a)) {
        const v = words.map((x) => (x === w ? w.split(a).join(b) : x)).join(' ');
        variants.add(v);
        if (variants.size >= max) return [...variants];
      }
    }
  }
  return [...variants].slice(0, max);
}

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i;
function isISRC(str) {
  return ISRC_RE.test(String(str || '').trim());
}

function extractISRC(str) {
  const m = /([A-Z]{2}[A-Z0-9]{3}\d{7})/i.exec(String(str || ''));
  return m ? m[1].toUpperCase() : null;
}

const URL_PATTERNS = [
  { platform: 'spotify', re: /open\.spotify\.com\/(track|album|artist|playlist)\/([A-Za-z0-9]+)/i },
  { platform: 'youtube', re: /(?:youtube\.com\/watch\?[^ ]*v=|youtu\.be\/|music\.youtube\.com\/watch\?[^ ]*v=)([A-Za-z0-9_-]{6,})/i },
  { platform: 'apple', re: /music\.apple\.com\/[a-z-]*\/(song|album)\/[^/]+\/(\d+)/i },
  { platform: 'deezer', re: /deezer\.com\/[a-z-]*\/(track|album|artist)\/(\d+)/i },
  { platform: 'soundcloud', re: /soundcloud\.com\/([^ ]+)/i },
  { platform: 'bandcamp', re: /([a-z0-9-]+\.bandcamp\.com\/track\/[^ ?]+)/i },
  { platform: 'jiosaavn', re: /jiosaavn\.com\/song\/[^ ]+\/([A-Za-z0-9_-]+)/i },
];

function detectUrl(str) {
  const s = String(str || '');
  for (const p of URL_PATTERNS) {
    const m = p.re.exec(s);
    if (m) return { platform: p.platform, kind: m[1] || 'track', id: m[2] || m[1], url: m[0] };
  }
  return null;
}

/**
 * Classify a user query: isrc | url | lyrics-fragment | artist-album | title ...
 */
function classifyQuery(raw) {
  const q = String(raw || '').trim();
  if (!q) return { kind: 'empty', raw: q };
  const url = detectUrl(q);
  if (url) return { kind: 'url', raw: q, url };
  const isrc = extractISRC(q);
  if (isrc && normalize(q).replace(/\s+/g, '').length <= 14) return { kind: 'isrc', raw: q, isrc };
  if (isrc) return { kind: 'text', raw: q, isrcHint: isrc };
  // quoted fragment or long sentence => likely a lyrics fragment
  if ((/^["“].*["”]$/s.test(q) && q.length > 15) || (q.split(/\s+/).length >= 6 && !/^.+\s[-–—]\s.+$/.test(q))) {
    return { kind: 'lyrics-fragment', raw: q, fragment: q.replace(/^["“]|["”]$/g, '').trim() };
  }
  // "Title - Artist" or "Title by Artist"
  let m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(q);
  if (m) return { kind: 'title-artist', raw: q, title: m[1].trim(), artist: m[2].trim() };
  m = /^(.+?)\s+by\s+(.+)$/i.exec(q);
  if (m) return { kind: 'title-artist', raw: q, title: m[1].trim(), artist: m[2].trim() };
  return { kind: 'text', raw: q };
}

/** Normalize a candidate/result record for matching. */
function normalizeTrack(t) {
  const title = String(t.title || '');
  const sv = splitVersion(title);
  return {
    titleNorm: normalize(sv.base),
    titleFull: normalize(title),
    versions: sv.versions,
    artistNorm: normalize(t.artist || ''),
    artistsNorm: (t.artists || []).map(normalize),
    albumNorm: normalize(t.album || ''),
    year: t.year || (t.releaseDate ? parseInt(String(t.releaseDate).slice(0, 4), 10) : null) || null,
    durationMs: t.durationMs || null,
    isrc: t.isrc ? String(t.isrc).toUpperCase() : null,
  };
}

module.exports = {
  normalize, stripDiacritics, unifyQuotes, splitVersion, romanVariants,
  isISRC, extractISRC, detectUrl, classifyQuery, normalizeTrack, VERSION_TAGS,
};
