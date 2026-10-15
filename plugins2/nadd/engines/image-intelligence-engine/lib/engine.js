'use strict';
/**
 * ImageSearchEngine: parse -> select sources -> SEQUENTIAL per-source loop
 * (one at a time; a failure never stops the loop) -> normalize -> dedupe ->
 * license filter -> rank -> slice. Metadata only; downloads are on-demand.
 */
const { BaseImageSource } = require('./base-source');
const registry = require('./registry');
const { parseInput } = require('./query');
const { selectSources } = require('./selector');
const { normalize } = require('./normalizer');
const { dedupe } = require('./dedup');
const { rank } = require('./ranker');
const { passesLicenseFilter } = require('./license');
const { createCache } = require('./cache');
const { createTracker } = require('./health');
const { downloadImage, cleanupTemp } = require('./download');

function envInt(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : def;
}

class ImageSearchEngine {
  constructor(opts = {}) {
    this.env = opts.env || ((k) => process.env[k]);
    this.sources = opts.sources || registry.all();
    this.health = opts.health || createTracker();
    this.cache = opts.cache || createCache();
    this.byId = new Map(this.sources.map((s) => [s.id, s]));
  }

  _wrap(source) {
    return new BaseImageSource(source._adapter, { env: this.env, health: this.health });
  }

  async search(queryText, options = {}) {
    const t0 = Date.now();
    const { query, filters } = parseInput(queryText);
    const merged = { ...(options.filters || {}), ...filters };
    // options.filters are defaults; explicit flags win — actually flags should
    // win over programmatic defaults only when set; parseInput defaults are
    // falsy-safe, so a simple merge with flags last is fine.
    const command = options.command || 'image';
    const perSource = options.perSource || envInt('IMAGE_RESULTS_PER_SOURCE', 10);
    const maxResults = options.maxResults || merged.limit || envInt('IMAGE_FINAL_RESULTS', 30);

    const selected = selectSources(
      command, query,
      { maxSources: options.maxSources },
      this.sources, this.health
    );

    const all = [];
    const failures = [];
    const sourcesUsed = [];

    // SEQUENTIAL: one source at a time, normalize, release, next.
    for (const src of selected) {
      const cacheKey = JSON.stringify({ q: query, s: src.id, f: merged, p: perSource });
      let raws = this.cache.get(cacheKey);
      if (raws === undefined) {
        try {
          raws = await this._wrap(src).search(query, { limit: perSource, filters: merged });
          this.cache.set(cacheKey, raws || []);
        } catch (e) {
          failures.push({ source: src.id, error: String((e && e.message) || e).slice(0, 200) });
          continue; // failure isolation: never stops the loop
        }
      }
      sourcesUsed.push(src.id);
      for (const r of raws || []) {
        try {
          const img = normalize(r, src._adapter);
          img.metadata = img.metadata || {};
          img.metadata._priority = src.priority;
          all.push(img);
        } catch (_) { /* skip malformed */ }
      }
      raws = null; // release between sources (memory safety)
    }

    let imgs = dedupe(all);
    imgs = imgs.filter((img) => {
      if (!passesLicenseFilter(img, merged)) return false;
      if (merged.minWidth && img.width && img.width < merged.minWidth) return false;
      if (merged.minHeight && img.height && img.height < merged.minHeight) return false;
      if (merged.orientation && img.orientation && img.orientation !== merged.orientation) return false;
      if (merged.transparent && img.format !== 'svg' && img.format !== 'png') return false;
      return true;
    });
    rank(imgs, query, merged, (img) => (img.metadata && img.metadata._priority) || 50);
    const results = imgs.slice(0, maxResults);

    return {
      query, filters: merged, command,
      results, sourcesUsed, failures,
      totalCandidates: imgs.length,
      tookMs: Date.now() - t0,
    };
  }

  async searchSource(sourceId, queryText, options = {}) {
    const src = this.byId.get(sourceId);
    if (!src) throw new Error(`unknown source: ${sourceId}`);
    const { query, filters } = parseInput(queryText);
    const perSource = options.perSource || envInt('IMAGE_RESULTS_PER_SOURCE', 10);
    const raws = await this._wrap(src).search(query, { limit: perSource, filters });
    const imgs = raws.map((r) => normalize(r, src._adapter));
    rank(imgs, query, filters, () => src.priority);
    return { query, source: sourceId, results: imgs.slice(0, options.maxResults || envInt('IMAGE_FINAL_RESULTS', 30)) };
  }

  async searchCategory(category, queryText, options = {}) {
    return this.search(queryText, { ...options, command: category });
  }

  async getImage(id, sourceId) {
    const src = this.byId.get(sourceId);
    if (!src) throw new Error(`unknown source: ${sourceId}`);
    const raw = await this._wrap(src).getImage(id, {});
    return normalize(raw, src._adapter);
  }

  async downloadImage(image, options = {}) {
    return downloadImage(image, options);
  }

  cleanupTemp(p) { return cleanupTemp(p); }

  healthSummary() {
    return {
      totalSources: this.sources.length,
      byStatus: this.health.summary(),
      sources: this.sources.map((s) => {
        const st = this.health.getStatus(s.id);
        return {
          id: s.id, name: s.name, type: s.type, transport: s.transport,
          enabled: s.enabled, priority: s.priority,
          endpointVerified: s.endpointVerified, requiresKey: s.requiresKey,
          status: st.status, latencyMs: st.latencyMs, resultCount: st.resultCount,
          errorCount: st.errorCount, lastError: st.lastError,
        };
      }),
    };
  }
}

module.exports = { ImageSearchEngine };
