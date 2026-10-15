'use strict';
/* Attribution log. "Proper attribution" made machine-readable:
 * every search is appended with its query, provider, result URLs,
 * and the provider's terms/API docs — so provenance is never lost. */

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.join(process.cwd(), 'attribution-log.json');

function append({ query, provider, results, file }) {
  const target = file || DEFAULT_FILE;
  let log = [];
  try {
    if (fs.existsSync(target)) log = JSON.parse(fs.readFileSync(target, 'utf8') || '[]');
    if (!Array.isArray(log)) log = [];
  } catch { log = []; }
  log.push({
    at: new Date().toISOString(),
    query: query || null,
    provider,
    result_count: results.length,
    items: results.map(r => ({
      id: r.id,
      title: r.title,
      url: r.url,
      embed_url: r.embed_url,
      provider_terms: r.license && r.license.provider_terms,
      api_docs: r.license && r.license.api_docs,
    })),
  });
  fs.writeFileSync(target, JSON.stringify(log, null, 2));
  return target;
}

module.exports = { append, DEFAULT_FILE };
