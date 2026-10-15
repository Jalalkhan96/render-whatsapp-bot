'use strict';
/* ScraperManager: sequential site queue.
 * Workflow per site: scrape → normalize → dedupe → persist → cleanup → next.
 * A site failure is caught, logged, recorded, and the run continues. (§2, §11, §12, §39) */
const crypto = require('crypto');
const config = require('./config.cjs');
const log = require('./logger.cjs');
const db = require('./db.cjs');
const registry = require('./registry.cjs');
const { validateAdapter } = require('./base.cjs');
const health = require('./health.cjs');

function sinceToDate(since) {
  if (!since || since === 'all') return null;
  const now = Date.now();
  const map = {
    'last_1_hour': 3600e3, 'last_6_hours': 6 * 3600e3, 'last_12_hours': 12 * 3600e3,
    'last_24_hours': 24 * 3600e3, '24h': 24 * 3600e3, 'last_3_days': 3 * 24 * 3600e3,
    'today': null,
  };
  if (since === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  const ms = map[since];
  return ms ? new Date(now - ms) : null;
}

function passesTimeFilter(record, sinceDate) {
  if (!sinceDate) return true;
  const p = record.publishedAt || record.startTime || record.scrapedAt;
  if (!p) return true; // no date info — keep rather than drop
  const d = new Date(p);
  return isNaN(d.getTime()) ? true : d >= sinceDate;
}

class ScraperManager {
  constructor(opts = {}) {
    this.opts = opts;
    this.stopped = false;
  }

  stop() { this.stopped = true; }

  enabledSites() {
    return registry.listSites()
      .filter(s => {
        try {
          const { adapter } = registry.getAdapter(s.id);
          validateAdapter(adapter, s.id);
          return adapter.enabled !== false;
        } catch (err) {
          log.error('manager.adapter_load', { site: s.id, err: err.message });
          return false;
        }
      })
      .sort((a, b) => a.priority - b.priority);
  }

  async runSite(siteId, opts = {}) {
    const runId = opts.runId || crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const site = { site: siteId, status: 'failed', reason: '', recordsFound: 0, recordsSaved: 0, duplicates: 0, durationMs: 0, startedAt, finishedAt: '', runId };
    log.info('scraper.start', { site: siteId });

    try {
      const { meta, adapter } = registry.getAdapter(siteId);
      validateAdapter(adapter, siteId);
      db.upsertSource({ id: adapter.id || siteId, name: adapter.name || meta.name, country: adapter.country || meta.country, category: adapter.category || meta.category, baseUrl: adapter.baseUrl || meta.baseUrl, transport: adapter.transport });

      if (adapter.transport === 'provider-required') {
        site.status = 'degraded';
        site.reason = 'provider-required: ' + (adapter.providerRequiredReason || 'external provider needed');
        log.warn('scraper.provider_required', { site: siteId, reason: adapter.providerRequiredReason });
      } else {
        const limit = opts.limit || adapter.limits?.maxResults || config.maxResultsPerSite;
        const rawRecords = await adapter.latest({ limit, since: opts.since });
        // Central safety net: never exceed the configured per-site limit,
        // even if an adapter ignores opts.limit.
        const records = (Array.isArray(rawRecords) ? rawRecords : []).slice(0, limit);
        const sinceDate = sinceToDate(opts.since);
        const filtered = records.filter(r => passesTimeFilter(r, sinceDate));
        site.recordsFound = filtered.length;
        log.info('scraper.records', { site: siteId, count: filtered.length });

        let saved = 0, dups = 0;
        for (const rec of filtered) {
          try {
            const out = db.saveRecord(rec);
            if (out === 'saved') saved++; else dups++;
          } catch (err) {
            db.insertError(runId, siteId, 'persist', err.message);
            log.error('scraper.persist_error', { site: siteId, err: err.message });
          }
        }
        site.recordsSaved = saved;
        site.duplicates = dups;
        site.status = 'success';
        log.info('scraper.saved', { site: siteId, count: saved, duplicates: dups });
        db.recordSourceRun(adapter.id || siteId, true, Date.now() - t0, saved);
      }
    } catch (err) {
      site.status = 'failed';
      site.reason = classifyError(err);
      db.insertError(runId, siteId, 'scrape', err.message);
      log.error('scraper.failed', { site: siteId, reason: site.reason });
      try { db.recordSourceRun(siteId, false, Date.now() - t0, 0); } catch (_) {}
      if (/timeout|timed out|abort/i.test(err.message)) health.setHealth(siteId, 'timeout', err.message);
      else if (/403|401|blocked|denied|captcha|challenge/i.test(err.message)) health.setHealth(siteId, 'blocked', err.message);
    } finally {
      site.finishedAt = new Date().toISOString();
      site.durationMs = Date.now() - t0;
      try { db.insertSiteRun(site); } catch (e) { log.error('db.insertSiteRun', { err: e.message }); }
      log.info('scraper.cleanup', { site: siteId });
      if (global.gc) { try { global.gc(); } catch (_) {} } // release memory between sites
      log.info('scraper.complete', { site: siteId, status: site.status });
    }
    return site;
  }

  /* Sequential run over all enabled sites, one at a time. */
  async runAll(opts = {}) {
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const sites = this.enabledSites();
    log.info('run.start', { runId, totalSites: sites.length });
    const results = [];
    let i = 0;
    for (const s of sites) {
      if (this.stopped) { log.warn('run.stopped', { runId }); break; }
      i++;
      process.stdout.write(`[${String(i).padStart(3, '0')}/${sites.length}] ${s.id.padEnd(16)} ... `);
      const r = await this.runSite(s.id, { ...opts, runId });
      results.push(r);
      process.stdout.write(`${r.status.toUpperCase()} (${r.recordsSaved} saved, ${r.durationMs}ms)\n`);
    }
    const summary = buildSummary(runId, startedAt, results);
    db.insertRunSummary(summary);
    log.info('run.complete', { runId, ...summary.totals });
    return summary;
  }

  async runCategory(category, opts = {}) {
    const sites = this.enabledSites().filter(s => s.category === category);
    log.info('run.category', { category, count: sites.length });
    const results = [];
    for (const s of sites) {
      if (this.stopped) break;
      results.push(await this.runSite(s.id, { ...opts, runId: opts.runId || crypto.randomUUID() }));
    }
    return results;
  }

  async runCountry(country, opts = {}) {
    const sites = this.enabledSites().filter(s => s.country === country);
    const results = [];
    for (const s of sites) {
      if (this.stopped) break;
      results.push(await this.runSite(s.id, { ...opts, runId: opts.runId || crypto.randomUUID() }));
    }
    return results;
  }

  async searchSite(siteId, query, opts = {}) {
    const { adapter } = registry.getAdapter(siteId);
    validateAdapter(adapter, siteId);
    const out = await adapter.search(query, opts);
    if (out && out.supported === false) return out;
    return Array.isArray(out) ? out.slice(0, opts.limit || 20) : [];
  }
}

function classifyError(err) {
  const m = (err && err.message || String(err)).toLowerCase();
  if (/timeout|timed out|abort/.test(m)) return 'timeout';
  if (/captcha|challenge|cloudflare/.test(m)) return 'blocked: anti-bot challenge';
  if (/403|denied|forbidden/.test(m)) return 'blocked: 403 forbidden';
  if (/401|unauthorized|login/.test(m)) return 'blocked: auth required';
  if (/econn|enotfound|eai_again|socket/.test(m)) return 'network error';
  if (/too large/.test(m)) return 'response too large';
  return m.slice(0, 160);
}

function buildSummary(runId, startedAt, results) {
  const totals = { successful: 0, failed: 0, degraded: 0, recordsFound: 0, recordsSaved: 0, duplicates: 0 };
  for (const r of results) {
    if (r.status === 'success') totals.successful++;
    else if (r.status === 'degraded') totals.degraded++;
    else totals.failed++;
    totals.recordsFound += r.recordsFound;
    totals.recordsSaved += r.recordsSaved;
    totals.duplicates += r.duplicates;
  }
  return {
    runId, startedAt, finishedAt: new Date().toISOString(),
    totalSites: results.length, ...totals,
    sites: results.map(r => ({ site: r.site, status: r.status, reason: r.reason, recordsFound: r.recordsFound, recordsSaved: r.recordsSaved, duplicates: r.duplicates, durationMs: r.durationMs })),
  };
}

module.exports = { ScraperManager, classifyError, sinceToDate };
