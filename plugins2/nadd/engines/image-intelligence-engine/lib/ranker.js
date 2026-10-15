'use strict';
/**
 * Result ranking: each image gets {score 0-100, reasons[]}.
 * Weighted: query/title/tag similarity, source relevance+reliability,
 * resolution, license confidence, commercial suitability, popularity,
 * orientation/aspect match. Deterministic.
 */

function tokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

function rank(images, query, filters = {}, priorityOf) {
  const q = tokens(query);
  const qset = new Set(q);
  const getPriority = typeof priorityOf === 'function' ? priorityOf : () => 50;

  for (const img of images) {
    let score = 0;
    const reasons = [];
    const title = tokens(img.title);
    const tags = (img.tags || []).map((t) => String(t).toLowerCase());
    const desc = tokens(img.description);

    if (q.length) {
      const titleHits = title.filter((t) => qset.has(t)).length;
      if (titleHits === q.length) { score += 30; reasons.push('exact title match'); }
      else if (titleHits > 0) { score += (titleHits / q.length) * 22; reasons.push('title match'); }
      const tagHits = tags.filter((t) => qset.has(t) || q.some((x) => t.includes(x) && x.length > 2)).length;
      if (tagHits > 0) { score += Math.min(20, tagHits * 5); reasons.push(tagHits > 1 ? 'tag matches' : 'tag match'); }
      if (desc.some((t) => qset.has(t))) { score += 5; reasons.push('description match'); }
    }

    // source relevance + reliability (lower priority number = more preferred)
    const pr = getPriority(img);
    if (typeof pr === 'number') {
      const b = Math.max(0, 10 * (1 - pr / 100));
      score += b;
      if (b >= 7) reasons.push('preferred source');
    }

    // resolution
    const mp = (img.width * img.height) / 1e6;
    if (mp >= 8) { score += 10; reasons.push('high resolution'); }
    else if (mp >= 2) score += 6;
    else if (mp >= 0.3) score += 3;

    // license confidence (known, specific license beats unknown)
    if (!img.licenseUnknown && img.license !== 'Unknown') {
      score += 8;
      reasons.push('verified license metadata');
    }

    // commercial suitability
    if (filters.commercial && img.commercialUse === true) {
      score += 7;
      reasons.push('commercial-use permitted');
    }

    // popularity
    const pop = img.metadata && (img.metadata.likes || img.metadata.downloads || img.metadata.views || 0);
    if (pop > 10000) { score += 5; reasons.push('popular'); }
    else if (pop > 0) score += 2;

    // orientation / aspect match
    if (filters.orientation && img.orientation === filters.orientation) {
      score += 5;
      reasons.push('orientation match');
    }
    if (filters.minWidth && img.width >= filters.minWidth) { score += 3; reasons.push('meets min width'); }
    if (filters.minHeight && img.height >= filters.minHeight) { score += 3; reasons.push('meets min height'); }

    img.score = Math.min(100, Math.round(score));
    img.reasons = reasons;
  }
  images.sort((a, b) => b.score - a.score || (b.width * b.height) - (a.width * a.height));
  return images;
}

module.exports = { rank };
