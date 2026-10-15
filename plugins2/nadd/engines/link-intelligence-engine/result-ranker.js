'use strict';
// Ranks multiple provider results; detects conflicts for cross-provider verification.
const { normalizeUrl } = require('./url-normalizer');
function rank(results) {
  // results: [{ providerId, finalUrl, status }]
  const ok = results.filter((r) => r.status === 'resolved' && r.finalUrl);
  if (!ok.length) return { verdict: 'unresolved', results };
  const groups = new Map();
  for (const r of ok) {
    let n; try { n = normalizeUrl(r.finalUrl); } catch (_) { n = r.finalUrl; }
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(r.providerId);
  }
  const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const [topUrl, topProviders] = entries[0];
  if (entries.length === 1) return { verdict: 'high', finalUrl: topUrl, providers: topProviders, results };
  return { verdict: 'conflict', finalUrl: topUrl, providers: topProviders,
    conflicts: entries.slice(1).map(([u, p]) => ({ finalUrl: u, providers: p })), results };
}
module.exports = { rank };
