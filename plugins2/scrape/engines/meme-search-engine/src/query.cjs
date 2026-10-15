'use strict';

/**
 * query.cjs — normalize a human query into matchable terms.
 * "Pepe the Frog!!" -> { original, terms: ['pepe','frog'], isPepe: true }
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'with',
  'meme', 'memes', 'image', 'images', 'pic', 'pics', 'picture', 'funny',
]);

function normalize(raw) {
  const original = String(raw || '').trim();
  const lowered = original.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const terms = lowered
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  const deduped = [...new Set(terms)];
  return {
    original,
    terms: deduped,
    isPepe: /\bpepe\b/.test(lowered),
    // joined form used for Wikimedia full-text search
    searchText: deduped.join(' ') || original,
  };
}

/** Count how many query terms appear in haystack (case-insensitive). */
function termHits(q, haystack) {
  const h = String(haystack || '').toLowerCase();
  let hits = 0;
  for (const t of q.terms) if (h.includes(t)) hits++;
  return hits;
}

module.exports = { normalize, termHits, STOPWORDS };
