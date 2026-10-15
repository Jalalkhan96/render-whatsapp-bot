'use strict';
/**
 * Deduplication: source+sourceId, canonical image URL (tracking params
 * stripped), sha1(imageUrl), normalized title+creator, near-title similarity.
 * Merged groups keep the highest-resolution item and attach alsoFrom[].
 */
const crypto = require('crypto');

function canonicalUrl(u) {
  try {
    const x = new URL(String(u));
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|gclsrc|ref|mc_|_hs|vero|ml_)/i.test(k)) x.searchParams.delete(k);
    }
    x.searchParams.sort();
    const qs = x.searchParams.toString();
    return (x.origin + x.pathname + (qs ? '?' + qs : '')).toLowerCase();
  } catch (_) {
    return String(u || '').trim().toLowerCase();
  }
}

function normStr(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleSim(a, b) {
  const wa = new Set(a.split(' ').filter(Boolean));
  const wb = new Set(b.split(' ').filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.size, wb.size);
}

const NEAR_TITLE_THRESHOLD = 0.85;

function dedupe(images) {
  const groups = [];
  const byKey = new Map();

  for (const img of images) {
    const keys = [];
    if (img.sourceKey && img.sourceId) keys.push(`sid:${img.sourceKey}:${img.sourceId}`);
    if (img.imageUrl) {
      const c = canonicalUrl(img.imageUrl);
      if (c) keys.push('url:' + crypto.createHash('sha1').update(c).digest('hex'));
    }
    const nt = normStr(img.title);
    const nc = normStr(img.creator);
    if (nt && nc) keys.push(`tc:${nc}|${nt}`);

    let g = null;
    for (const k of keys) {
      if (byKey.has(k)) { g = byKey.get(k); break; }
    }
    if (!g && nt && nc) {
      for (const cand of groups) {
        const c0 = cand[0];
        if (normStr(c0.creator) === nc && titleSim(nt, normStr(c0.title)) >= NEAR_TITLE_THRESHOLD) {
          g = cand;
          break;
        }
      }
    }
    if (!g) { g = []; groups.push(g); }
    g.push(img);
    for (const k of keys) byKey.set(k, g);
  }

  return groups.map((g) => {
    g.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const best = g[0];
    best.alsoFrom = g.slice(1).map((x) => ({
      source: x.source, sourceKey: x.sourceKey, sourceId: x.sourceId, sourceUrl: x.sourceUrl,
    }));
    return best;
  });
}

module.exports = { dedupe, canonicalUrl, NEAR_TITLE_THRESHOLD };
