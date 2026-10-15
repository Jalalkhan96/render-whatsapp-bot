/*
 * core/search-engine.cjs — sequential multi-source search pipeline (§1, §6, §101).
 *
 * For each search:
 *   SOURCE 1 -> request -> parse -> normalize -> dedupe -> save -> cleanup
 *   -> SOURCE 2 -> ... -> dedupe (global) -> rank -> final results
 *
 * - Default concurrency 1 (KNOWLEDGE_SOURCE_CONCURRENCY=1). Controlled
 *   concurrency only when explicitly enabled via options.
 * - Failure isolation: one source failing never crashes the run (§44).
 * - Pagination guards (§14): MAX_RESULTS_PER_SOURCE=20,
 *   MAX_PAGES_PER_SOURCE=5, MAX_FINAL_RESULTS=50.
 * - Memory protection (§47, §88): sources are queried one at a time and
 *   each source's response is released before the next starts.
 */
'use strict';

const { dedupe } = require('./deduplicator.cjs');
const { rankResults } = require('./result-ranker.cjs');
const { attachLicense } = require('./license-engine.cjs');

function envInt(name, fallback) {
  const v = process.env[name] ? Number(process.env[name]) : fallback;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

const MAX_RESULTS_PER_SOURCE = () => envInt('MAX_RESULTS_PER_SOURCE', 20);
const MAX_PAGES_PER_SOURCE = () => envInt('MAX_PAGES_PER_SOURCE', 5);
const MAX_FINAL_RESULTS = () => envInt('MAX_FINAL_RESULTS', 50);
const SOURCE_CONCURRENCY = () => envInt('KNOWLEDGE_SOURCE_CONCURRENCY', 1);

class SearchEngine {
  constructor(deps) {
    deps = deps || {};
    this.registry = deps.registry || null;
    this.cache = deps.cache || null;
    this.health = deps.health || null;
    this.store = deps.store || null;
    this.graph = deps.graph || null;
    this.log = typeof deps.log === 'function' ? deps.log : () => {};
  }

  async _runOneSource(sourceId, query, options) {
    const inst = this.registry.instantiate(sourceId, { cache: this.cache });
    const maxResults = options.maxResultsPerSource != null ? options.maxResultsPerSource : MAX_RESULTS_PER_SOURCE();
    const maxPages = options.maxPagesPerSource != null ? options.maxPagesPerSource : MAX_PAGES_PER_SOURCE();
    const started = Date.now();
    let results = [];
    let status = 'healthy';
    let detail = null;
    try {
      const cacheKey = `search:${sourceId}:${query}:${maxResults}`;
      if (this.cache) {
        const hit = this.cache.get('search', cacheKey);
        if (hit && Array.isArray(hit)) {
          this.log(`[cache] ${sourceId} HIT (${hit.length})`);
          return { sourceId, results: hit, status: 'healthy', detail: 'cache hit', latencyMs: 0 };
        }
      }
      const raw = await inst.search(query, { limit: maxResults, maxPages, page: options.page || 1 });
      results = (raw || []).slice(0, maxResults).map((r) => attachLicense(r));
      if (this.cache) this.cache.set('search', cacheKey, results);
      if (this.store) {
        // Metadata only — never full bodies (§48, §87).
        this.store.insertMany('knowledge_items', results.map((r) => ({
          source: r.source, sourceId: r.sourceId, sourceUrl: r.sourceUrl,
          title: r.title, itemType: r.type, creator: r.creator, date: r.date,
          license: r.license, query,
        })));
      }
      if (this.graph) for (const r of results) { try { this.graph.fromResult(r); } catch (_) {} }
    } catch (err) {
      status = classifyFailure(err);
      detail = err && err.message ? String(err.message).slice(0, 200) : 'unknown error';
      this.log(`[${sourceId}] FAILED: ${status} — ${detail}`);
      results = [];
    }
    const latencyMs = Date.now() - started;
    if (this.health) {
      if (status === 'healthy') this.health.recordSuccess(sourceId, latencyMs);
      else this.health.recordFailure(sourceId, status, detail);
    }
    // Explicit cleanup: release the source's batch before the next source runs.
    const out = results;
    results = null;
    return { sourceId, results: out, status, detail, latencyMs };
  }

  async search(query, options) {
    options = options || {};
    const q = String(query || '').trim();
    if (!q) return { query: q, results: [], sources: [], errors: [], totalMs: 0 };
    const sourceIds = (options.sourceIds || []).filter((id) => {
      const m = this.registry.get(id);
      return m && m.enabled && m.implemented;
    });
    const started = Date.now();
    const perSource = [];
    const errors = [];
    const concurrency = options.concurrency != null ? options.concurrency : SOURCE_CONCURRENCY();

    if (concurrency <= 1) {
      // §6 / §101: strictly sequential.
      for (let i = 0; i < sourceIds.length; i++) {
        const id = sourceIds[i];
        this.log(`[${String(i + 1).padStart(3, '0')}/${sourceIds.length}] ${id} ...`);
        const r = await this._runOneSource(id, q, options);
        perSource.push({ sourceId: id, count: r.results.length, status: r.status, detail: r.detail, latencyMs: r.latencyMs });
        if (r.status !== 'healthy') errors.push({ sourceId: id, status: r.status, detail: r.detail });
        this._accumulate(options, r.results);
        r.results = null; // cleanup before next source
      }
    } else {
      // Controlled concurrency: small worker pool, still bounded.
      let idx = 0;
      const acc = [];
      const worker = async () => {
        while (idx < sourceIds.length) {
          const i = idx++;
          const id = sourceIds[i];
          this.log(`[${String(i + 1).padStart(3, '0')}/${sourceIds.length}] ${id} ...`);
          const r = await this._runOneSource(id, q, options);
          perSource.push({ sourceId: id, count: r.results.length, status: r.status, detail: r.detail, latencyMs: r.latencyMs });
          if (r.status !== 'healthy') errors.push({ sourceId: id, status: r.status, detail: r.detail });
          acc.push(...r.results);
        }
      };
      const workers = [];
      for (let w = 0; w < Math.min(concurrency, sourceIds.length); w++) workers.push(worker());
      await Promise.all(workers);
      this._accumulate(options, acc);
    }

    const merged = this._drain(options);
    const { results: unique, duplicatesRemoved } = dedupe(merged);
    const ranked = rankResults(unique, q, { maxResults: options.maxFinalResults != null ? options.maxFinalResults : MAX_FINAL_RESULTS(), creator: options.creator });
    const totalMs = Date.now() - started;

    if (this.store) {
      try {
        this.store.insert('knowledge_searches', {
          query: q, category: options.category || null, sourceIds,
          resultCount: ranked.length, duplicatesRemoved, totalMs,
        });
      } catch (_) {}
    }

    return { query: q, results: ranked, sources: perSource, errors, duplicatesRemoved, totalMs };
  }

  _accumulate(options, batch) {
    if (!options._acc) options._acc = [];
    options._acc.push(...batch);
  }

  _drain(options) {
    const out = options._acc || [];
    options._acc = [];
    return out;
  }
}

function classifyFailure(err) {
  const msg = String((err && err.message) || '').toLowerCase();
  const info = (err && err.info) || {};
  if (info.kind === 'rate_limited' || info.status === 429) return 'rate_limited';
  if (info.status === 401 || info.status === 403 || /api key|unauthori[sz]ed|forbidden/.test(msg)) return 'auth_required';
  if (/timeout|timed out|abort/.test(msg)) return 'timeout';
  if (info.status === 404) return 'inactive';
  return 'degraded';
}

module.exports = { SearchEngine, MAX_RESULTS_PER_SOURCE, MAX_PAGES_PER_SOURCE, MAX_FINAL_RESULTS, SOURCE_CONCURRENCY, classifyFailure };
