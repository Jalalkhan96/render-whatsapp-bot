/*
 * core/health-manager.cjs — per-source health tracking (§43, §83).
 *
 * Statuses: healthy | degraded | timeout | auth_required | rate_limited |
 *            changed | inactive | license_unknown
 * Tracks: lastSuccess, lastFailure, averageLatency, errorCount.
 */
'use strict';

const STATUSES = ['healthy', 'degraded', 'timeout', 'auth_required', 'rate_limited', 'changed', 'inactive', 'license_unknown', 'not_implemented', 'unknown'];

const STATUS_ICON = {
  healthy: '✅', degraded: '⚠️', timeout: '⏱️', auth_required: '🔑',
  rate_limited: '🐢', changed: '🔄', inactive: '⛔', license_unknown: '❓',
  not_implemented: '🚧', unknown: '❔',
};

class HealthManager {
  constructor(opts) {
    opts = opts || {};
    this.records = new Map(); // sourceId -> record
    this.file = opts.file || null;
    if (this.file) this._load();
  }

  _load() {
    const fs = require('fs');
    try {
      if (fs.existsSync(this.file)) {
        const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        for (const [k, v] of Object.entries(data || {})) this.records.set(k, v);
      }
    } catch (_) { /* start empty */ }
  }

  _persist() {
    if (!this.file) return;
    const fs = require('fs');
    const path = require('path');
    try {
      const dir = path.dirname(this.file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj = {};
      for (const [k, v] of this.records) obj[k] = v;
      fs.writeFileSync(this.file, JSON.stringify(obj), 'utf8');
    } catch (_) { /* best effort */ }
  }

  _ensure(id) {
    if (!this.records.has(id)) {
      this.records.set(id, {
        id, status: 'unknown', lastSuccess: null, lastFailure: null,
        averageLatency: null, errorCount: 0, checks: 0, lastDetail: null,
      });
    }
    return this.records.get(id);
  }

  recordSuccess(id, latencyMs) {
    const r = this._ensure(id);
    r.status = 'healthy';
    r.lastSuccess = new Date().toISOString();
    r.checks += 1;
    r.averageLatency = r.averageLatency == null ? latencyMs
      : Math.round(r.averageLatency * 0.7 + latencyMs * 0.3);
    this._persist();
  }

  recordFailure(id, status, detail) {
    const r = this._ensure(id);
    if (STATUSES.includes(status)) r.status = status;
    r.lastFailure = new Date().toISOString();
    r.errorCount += 1;
    r.checks += 1;
    r.lastDetail = detail ? String(detail).slice(0, 200) : null;
    this._persist();
  }

  setStatus(id, status, detail) {
    const r = this._ensure(id);
    if (STATUSES.includes(status)) r.status = status;
    if (detail) r.lastDetail = String(detail).slice(0, 200);
    this._persist();
  }

  get(id) { return this.records.get(id) || null; }

  all() { return Array.from(this.records.values()); }

  summary() {
    const out = {};
    for (const r of this.records.values()) out[r.status] = (out[r.status] || 0) + 1;
    return out;
  }

  dashboard(lines) {
    // §83 `.sourcehealth` dashboard.
    const rows = (lines || this.all()).map((r) => {
      const icon = STATUS_ICON[r.status] || '❔';
      const lat = r.averageLatency != null ? `${r.averageLatency}ms` : '—';
      return `${String(r.id).padEnd(28)} ${icon} ${r.status.padEnd(15)} ${lat}`;
    });
    return '📊 SOURCE HEALTH\n\n' + rows.join('\n');
  }
}

module.exports = { HealthManager, STATUSES, STATUS_ICON };
