'use strict';
// Formats a redirect trace for chat display.
function formatTrace(trace) {
  const lines = ['🔗 REDIRECT TRACE', ''];
  trace.hops.forEach((h, i) => {
    const arrow = h.type === 'final' ? '' : `\n   ↓ ${h.statusCode || h.type}`;
    lines.push(`${i + 1}. ${h.hostname}${arrow}`);
  });
  lines.push('', `Hops: ${trace.hopCount}`, `Status: ${trace.status}`);
  return lines.join('\n');
}
module.exports = { formatTrace };
