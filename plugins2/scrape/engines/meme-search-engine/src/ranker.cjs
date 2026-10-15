'use strict';

/**
 * ranker.cjs — score candidates. Higher is better.
 *
 * score = termMatches * 10
 *       + log10(ups + 1) * 4          (Reddit upvotes)
 *       + freeLicenseBonus 6          (verified CC/PD outranks UGC)
 *       + imgflipPopularityBoost      (captions count already in ups)
 *       + titleExactBonus 5           (whole query in title)
 */
function score(item, q) {
  const terms = q.terms.length || 1;
  let s = (item._termHits || 0) / terms * 10;
  s += Math.log10((item.ups || 0) + 1) * 4;
  if (item.license && item.license.status === 'free') s += 6;
  const title = String(item.title || '').toLowerCase();
  if (q.searchText && title.includes(q.searchText.toLowerCase())) s += 5;
  if (item.nsfw) s -= 8;
  return Math.round(s * 10) / 10;
}

function rank(items, q) {
  for (const it of items) it.score = score(it, q);
  items.sort((a, b) => b.score - a.score);
  return items;
}

module.exports = { score, rank };
