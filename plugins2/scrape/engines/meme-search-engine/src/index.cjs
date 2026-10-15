'use strict';

/**
 * index.cjs — public API: searchMemes(query, opts)
 *
 * Pipeline: normalize query -> cache check -> fan out to sources ->
 * record health -> merge -> dedup -> rank -> slice -> cache store.
 * One failing source never kills the search.
 */
const config = require('./config.cjs');
const { normalize } = require('./query.cjs');
const { list, get } = require('./sources/index.cjs');
const { dedup } = require('./dedup.cjs');
const { rank } = require('./ranker.cjs');
const cache = require('./cache.cjs');
const health = require('./health.cjs');

async function searchMemes(rawQuery, opts = {}) {
  const query = String(rawQuery || '').trim();
  if (!query) throw new Error('query is empty');

  const o = {
    limit: Math.max(1, Math.min(opts.limit || config.defaultLimit, 200)),
    sources: opts.sources && opts.sources.length ? opts.sources : config.sources,
    nsfw: !!opts.nsfw,
    noCache: !!opts.noCache,
    timeoutMs: opts.timeoutMs || config.defaultTimeoutMs,
    cwd: opts.cwd || process.cwd(),
  };

  const q = normalize(query);

  if (!o.noCache) {
    const cached = cache.get(query, o.sources, o.limit, o.nsfw, o.cwd);
    if (cached) {
      cached._meta = {
        query, sources: o.sources, cached: true,
        totalCandidates: cached.length, returned: cached.length,
        errors: {}, health: health.status(o.cwd),
      };
      return cached;
    }
  }

  const settled = await Promise.allSettled(
    o.sources.map(async (name) => {
      const src = get(name);
      if (src.status === 'auth_required') {
        return { name, skipped: 'auth_required' };
      }
      try {
        const items = await src.search(q, o);
        health.record(name, true, null, o.cwd);
        return { name, items };
      } catch (err) {
        health.record(name, false, err, o.cwd);
        return { name, error: err.message, items: [] };
      }
    })
  );

  const errors = {};
  let merged = [];
  for (const s of settled) {
    const v = s.status === 'fulfilled' ? s.value : { name: '?', error: String(s.reason) };
    if (v.error) errors[v.name] = v.error;
    if (v.skipped) errors[v.name] = `skipped (${v.skipped})`;
    merged = merged.concat(v.items || []);
  }

  const results = rank(dedup(merged), q).slice(0, o.limit);
  if (!o.noCache) cache.set(query, o.sources, o.limit, o.nsfw, results, o.cwd);

  results._meta = {
    query,
    sources: o.sources,
    totalCandidates: merged.length,
    returned: results.length,
    errors,
    health: health.status(o.cwd),
  };
  return results;
}

module.exports = { searchMemes, listSources: list, version: config.version };
