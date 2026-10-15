'use strict';

/**
 * output.cjs — json / csv / txt formatters.
 */
function toPublic(item) {
  const { _termHits, _sub, ...rest } = item; // strip internals
  return rest;
}

function json(items) {
  return JSON.stringify(items.map(toPublic), null, 2);
}

function csv(items) {
  const rows = [['score', 'source', 'title', 'image_url', 'page_url', 'author', 'ups', 'license', 'license_name']];
  for (const it of items.map(toPublic)) {
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    rows.push([it.score, it.source, q(it.title), it.imageUrl, it.pageUrl, q(it.author), it.ups, it.license.status, q(it.license.name)].join(','));
  }
  return rows.join('\n');
}

function txt(items) {
  return items.map(toPublic)
    .map((it) => `[${it.score}] (${it.source}/${it.license.status}) ${it.title}\n${it.imageUrl}`)
    .join('\n\n');
}

function format(items, fmt) {
  switch ((fmt || 'json').toLowerCase()) {
    case 'json': return json(items);
    case 'csv': return csv(items);
    case 'txt': return txt(items);
    default: throw new Error(`unknown format: ${fmt}`);
  }
}

module.exports = { format, toPublic };
