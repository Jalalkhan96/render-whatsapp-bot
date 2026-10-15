'use strict';

function normKey(it) {
  if (it.kind === 'video-link') return 'yt:' + it.id;
  try {
    const url = new URL(String(it.mediaUrl));
    url.hash = '';
    return 'au:' + url.toString().toLowerCase().replace(/\/$/, '');
  } catch {
    return 'au:' + String(it.mediaUrl || '').toLowerCase();
  }
}

function dedup(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = normKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

module.exports = { dedup };
