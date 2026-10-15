'use strict';
// SafetyEngine: heuristic risk scoring. Never claims "safe" from resolution alone.
const { analyzeDomain } = require('./domain-analyzer');
function assess({ url, hopCount = 0, tracking = null, providerHealth = null }) {
  const signals = [];
  let score = 0;
  const d = analyzeDomain(url);
  if (!d.https) { signals.push('no_https'); score += 25; }
  if (d.isIp) { signals.push('ip_based_destination'); score += 30; }
  if (d.punycode) { signals.push('punycode_hostname'); score += 20; }
  if (d.signals.includes('credentials_in_url')) { signals.push('credentials_in_url'); score += 35; }
  if (d.signals.includes('lookalike_keyword')) { signals.push('possible_lookalike_domain'); score += 15; }
  if (d.signals.includes('deep_subdomain')) { signals.push('deep_subdomain_chain'); score += 10; }
  if (hopCount > 8) { signals.push('excessive_redirects'); score += 15; }
  else if (hopCount > 4) { signals.push('many_redirects'); score += 8; }
  if (tracking && tracking.detected && tracking.parameters.length > 5) { signals.push('heavy_tracking'); score += 10; }
  let risk = 'unknown';
  if (score >= 60) risk = 'high';
  else if (score >= 30) risk = 'medium';
  else if (score >= 0) risk = 'low';
  return { risk, score, signals, note: 'Heuristic only — resolution success does not imply safety.' };
}
module.exports = { assess };
