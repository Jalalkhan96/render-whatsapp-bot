'use strict';
/* Point ranker. Transparent, documented, no black boxes.
 * +40 title keyword match (all query words present)
 * +10 * log10(views+1)
 * +4  * rating (0..5)
 * -20 duration missing or absurd (>12h)
 * Ties: more views wins. */

function score(result, queryWords) {
  let s = 0;
  const title = String(result.title || '').toLowerCase();
  if (queryWords.length && queryWords.every(w => title.includes(w))) s += 40;
  s += 10 * Math.log10((result.views || 0) + 1);
  if (result.rating != null) s += 4 * result.rating;
  if (!result.duration_sec || result.duration_sec > 43200) s -= 20;
  return s;
}

function rank(results, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(w => w.length > 1);
  return results
    .map(r => ({ ...r, _score: score(r, words) }))
    .sort((a, b) => b._score - a._score || b.views - a.views)
    .map(({ _score, ...r }) => r);
}

module.exports = { rank, score };
