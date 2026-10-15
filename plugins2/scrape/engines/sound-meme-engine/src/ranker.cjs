'use strict';

// score = termMatches * 10 + log10(views+1) * 3 + freeLicenseBonus 6
//       + downloadableBonus 2 (real file beats a link) + exactTitleBonus 5
function score(item, q) {
  const terms = q.terms.length || 1;
  let s = (item._termHits || 0) / terms * 10;
  s += Math.log10((item.views || 0) + 1) * 3;
  if (item.license && item.license.status === 'free') s += 6;
  if (item.downloadable) s += 2;
  const title = String(item.title || '').toLowerCase();
  if (q.searchText && title.includes(q.searchText.toLowerCase())) s += 5;
  return Math.round(s * 10) / 10;
}

function rank(items, q) {
  for (const it of items) it.score = score(it, q);
  items.sort((a, b) => b.score - a.score);
  return items;
}

module.exports = { score, rank };
