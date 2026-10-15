'use strict';

function toPublic(item) {
  const { _termHits, ...rest } = item;
  return rest;
}

function json(items) {
  return JSON.stringify(items.map(toPublic), null, 2);
}

function csv(items) {
  const rows = [['score', 'source', 'kind', 'title', 'url', 'page_url', 'author', 'duration_s', 'views', 'downloadable', 'license']];
  const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  for (const it of items.map(toPublic)) {
    rows.push([
      it.score, it.source, it.kind, q(it.title), it.mediaUrl || '', it.pageUrl,
      q(it.author), it.durationSec == null ? '' : it.durationSec, it.views,
      it.downloadable, it.license.status,
    ].join(','));
  }
  return rows.join('\n');
}

function txt(items) {
  return items.map(toPublic).map((it) =>
    `[${it.score}] (${it.source}/${it.kind}/${it.license.status}) ${it.title}\n` +
    (it.downloadable ? it.mediaUrl : it.pageUrl)
  ).join('\n\n');
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
