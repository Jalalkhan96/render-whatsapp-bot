/*
 * core/scheduler.cjs — source-specific refresh intervals (§36-37, §84-85).
 *
 * Frequencies:
 *   fast   — Wikipedia changes, Wikidata updates, research indexes, new datasets
 *   daily  — Internet Archive metadata, museum collections, government datasets, new releases
 *   weekly — slow-changing cultural collections, historical archives, book metadata
 *   bulk   — Common Crawl, Wikidata dumps, OpenAlex dumps, Open Library dumps (admin-only)
 *
 * Health pings only — never full crawls (§84). Bulk runs only when
 * explicitly configured by the administrator.
 */
'use strict';

const DEFAULT_INTERVALS = {
  fast: 15 * 60 * 1000,          // 15 min
  daily: 24 * 60 * 60 * 1000,    // 24 h
  weekly: 7 * 24 * 60 * 60 * 1000,
  bulk: 30 * 24 * 60 * 60 * 1000, // 30 d (admin-triggered anyway)
};

const SOURCE_FREQUENCY = {
  // fast
  wikipedia: 'fast', wikidata: 'fast', wdqs: 'fast', openalex: 'fast', crossref: 'fast',
  semanticscholar: 'fast', arxiv: 'fast', datagov: 'fast', dataeuropa: 'fast',
  // daily
  'internet-archive': 'daily', 'open-library': 'daily', loc: 'daily',
  smithsonian: 'daily', 'met-museum': 'daily', artic: 'daily', europeana: 'daily',
  worldbank: 'daily', nasa: 'daily', zenodo: 'daily', figshare: 'daily',
  huggingface: 'daily',
  // bulk (admin only)
  commoncrawl: 'bulk',
  // weekly: everything else by default
};

function frequencyOf(sourceId) {
  return SOURCE_FREQUENCY[sourceId] || 'weekly';
}

class Scheduler {
  constructor(deps) {
    deps = deps || {};
    this.registry = deps.registry;
    this.health = deps.health;
    this.log = typeof deps.log === 'function' ? deps.log : () => {};
    this.timers = new Map();
    this.bulkEnabled = process.env.KNOWLEDGE_BULK_ENABLED === '1';
  }

  async pingSource(sourceId) {
    // §84: API availability + small query + latency only.
    const inst = this.registry.instantiate(sourceId, {});
    const started = Date.now();
    try {
      const res = await inst.healthCheck();
      const latency = Date.now() - started;
      if (this.health) {
        if (res.status === 'healthy') this.health.recordSuccess(sourceId, latency);
        else this.health.recordFailure(sourceId, res.status || 'degraded', res.detail);
      }
      return { sourceId, status: res.status || 'healthy', latencyMs: latency, detail: res.detail || null };
    } catch (err) {
      if (this.health) this.health.recordFailure(sourceId, 'degraded', err.message);
      return { sourceId, status: 'degraded', latencyMs: Date.now() - started, detail: String(err.message).slice(0, 200) };
    }
  }

  start() {
    // Group sources by frequency; one timer per frequency tier.
    const byFreq = { fast: [], daily: [], weekly: [] };
    for (const m of this.registry.list()) {
      if (!m.enabled || !m.implemented) continue;
      const f = frequencyOf(m.id);
      if (byFreq[f]) byFreq[f].push(m.id);
    }
    for (const [freq, ids] of Object.entries(byFreq)) {
      if (!ids.length) continue;
      const interval = DEFAULT_INTERVALS[freq];
      const run = async () => {
        for (const id of ids) {
          try { await this.pingSource(id); } catch (e) { this.log(`scheduler ping ${id} failed: ${e.message}`); }
        }
      };
      this.timers.set(freq, setInterval(run, interval));
      this.log(`scheduler: ${freq} tier (${ids.length} sources) every ${Math.round(interval / 1000)}s`);
    }
    return this;
  }

  stop() {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }
}

module.exports = { Scheduler, frequencyOf, DEFAULT_INTERVALS };
