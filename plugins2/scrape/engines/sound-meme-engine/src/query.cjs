'use strict';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'with',
  'sound', 'sounds', 'audio', 'effect', 'effects', 'sfx', 'clip', 'clips',
  'meme', 'memes', 'short', 'shorts', 'video', 'hd', 'free', 'download',
]);

function normalize(raw) {
  const original = String(raw || '').trim();
  const lowered = original.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const terms = [...new Set(
    lowered.split(/\s+/).filter((t) => t.length > 1 && !STOPWORDS.has(t))
  )];
  return {
    original,
    terms,
    isAnime: /\banime\b/.test(lowered),
    searchText: terms.join(' ') || original,
  };
}

function termHits(q, haystack) {
  const h = String(haystack || '').toLowerCase();
  let hits = 0;
  for (const t of q.terms) if (h.includes(t)) hits++;
  return hits;
}

module.exports = { normalize, termHits, STOPWORDS };
