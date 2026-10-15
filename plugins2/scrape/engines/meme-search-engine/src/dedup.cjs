'use strict';

/**
 * dedup.cjs — drop duplicate images across sources.
 * Key: normalized image URL (lowercased, query params stripped except the
 * ones that change the file, e.g. width params are stripped).
 */
function normUrl(u) {
  try {
    const url = new URL(String(u));
    url.hash = '';
    // strip cache-buster / sizing params that don't identify the file
    for (const p of [...url.searchParams.keys()]) {
      if (/^(width|w|crop|auto|s|utm_)/i.test(p)) url.searchParams.delete(p);
    }
    let s = url.toString().toLowerCase();
    s = s.replace(/\/$/, '');
    return s;
  } catch {
    return String(u || '').toLowerCase().split('?')[0];
  }
}

function dedup(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = normUrl(it.imageUrl);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

module.exports = { dedup, normUrl };
