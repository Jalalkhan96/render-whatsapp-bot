'use strict';
/**
 * Per-source health tracking.
 * Statuses: healthy | degraded | timeout | auth_required | changed | inactive | license_unknown
 * (plus 'unknown' for never-checked sources).
 */

function createTracker() {
  const rec = new Map();

  function get(id) {
    if (!rec.has(id)) {
      rec.set(id, {
        success: 0, fail: 0, lastSuccess: 0, lastFailure: 0,
        latencyMs: 0, resultCount: 0, errorCount: 0,
        lastError: '', authFail: false, manual: null,
      });
    }
    return rec.get(id);
  }

  function recordSuccess(id, latencyMs, resultCount) {
    const r = get(id);
    r.success++;
    r.lastSuccess = Date.now();
    r.latencyMs = latencyMs;
    r.resultCount = resultCount;
    r.authFail = false;
  }

  function recordFailure(id, err) {
    const r = get(id);
    const msg = String((err && err.message) || err || 'error');
    r.fail++;
    r.errorCount++;
    r.lastFailure = Date.now();
    r.lastError = msg.slice(0, 200);
    if (/401|unauthorized|invalid[_ ]?api[_ ]?key|api key|forbidden/i.test(msg)) r.authFail = true;
  }

  // Manual override: 'changed' | 'inactive' | 'license_unknown' | null (clear)
  function setStatus(id, status) { get(id).manual = status; }

  function getStatus(id) {
    const r = get(id);
    if (r.manual) return { id, status: r.manual, ...r };
    let status = 'healthy';
    if (r.authFail) status = 'auth_required';
    else if (r.fail >= 5) status = 'inactive';
    else if (r.fail >= 3) status = /timeout|timed out/i.test(r.lastError) ? 'timeout' : 'degraded';
    else if (r.fail >= 1) status = 'degraded';
    else if (!r.success && !r.fail) status = 'unknown';
    return { id, status, ...r };
  }

  function summary() {
    const by = {};
    for (const id of rec.keys()) {
      const s = getStatus(id).status;
      by[s] = (by[s] || 0) + 1;
    }
    return by;
  }

  return { recordSuccess, recordFailure, setStatus, getStatus, summary, _records: rec };
}

module.exports = { createTracker };
