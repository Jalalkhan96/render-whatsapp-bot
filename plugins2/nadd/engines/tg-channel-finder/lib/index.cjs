// Local post index: persist channel posts to JSON so content search is
// instant and goes deep (the @finding-style "find anything" engine).
// Posts are public channel posts scraped from t.me/s/ preview pages.
const fs = require('fs');
const path = require('path');
const { fetchChannelPosts } = require('./scrape.cjs');

function indexPath(root, dataFile) {
  const base = path.dirname(path.resolve(root, dataFile || './data.json'));
  return path.join(base, 'index.json');
}

function loadIndex(file) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (d && d.channels) return d;
  } catch (_) {}
  return { version: 1, channels: {} };
}

function saveIndex(file, idx) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(idx));
}

// Index (or refresh) a channel's posts. Dedupe by postId, newest first.
async function indexChannel(idx, channel, maxPages = 10, onEvent = () => {}) {
  const existing = idx.channels[channel]?.posts || [];
  const seen = new Set(existing.map((p) => p.postId));
  const fresh = await fetchChannelPosts(channel, maxPages, onEvent);
  let added = 0;
  for (const m of fresh) {
    if (!seen.has(m.postId)) { seen.add(m.postId); existing.push(m); added++; }
  }
  existing.sort((a, b) => Number(b.msgId) - Number(a.msgId));
  idx.channels[channel] = { indexedAt: new Date().toISOString(), posts: existing };
  return { channel, added, total: existing.length };
}

// Search the index: every term must appear (AND); ranked by hit count,
// then recency.
function searchIndex(idx, query, limit = 30) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const out = [];
  for (const [channel, entry] of Object.entries(idx.channels)) {
    for (const p of entry.posts || []) {
      const t = (p.text || '').toLowerCase();
      if (!t) continue;
      let score = 0;
      let ok = true;
      for (const term of terms) {
        const hits = t.split(term).length - 1;
        if (!hits) { ok = false; break; }
        score += hits;
      }
      if (ok) out.push({ ...p, channel, score });
    }
  }
  out.sort((a, b) => b.score - a.score || Number(b.msgId) - Number(a.msgId));
  return out.slice(0, limit);
}

function indexStats(idx) {
  return Object.entries(idx.channels).map(([ch, e]) => ({
    channel: ch,
    posts: (e.posts || []).length,
    indexedAt: (e.indexedAt || '').slice(0, 10),
  }));
}

module.exports = { indexPath, loadIndex, saveIndex, indexChannel, searchIndex, indexStats };
