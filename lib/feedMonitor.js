const fs = require('fs');
const path = require('path');
const { getChannelInfo } = require('./channelInfo');
const { funnyError } = require('./funny');

const FAKE_FORWARD = getChannelInfo();

const DATA_DIR = path.join(__dirname, '..', 'data');
const FEEDS_FILE = path.join(DATA_DIR, 'feeds.json');
const SEEN_FILE = path.join(DATA_DIR, 'seen.json');
const INTERVAL_MS = 5 * 60 * 1000;

let timer = null;

function read(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; }
}

function write(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error('[FEEDMON] write fail:', e.message); }
}

function defaultFeeds() {
  return [
    { id: 'pk', type: 'gnews', q: 'pakistan', region: 'PK', label: '🇵🇰 Pakistan News' },
    { id: 'dawn', type: 'gnews', q: 'site:dawn.com', region: 'PK', label: '🌄 Dawn News' },
    { id: 'bbc', type: 'rss', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', label: '🌍 BBC World' }
  ];
}

async function fetchFeed(feed) {
  try {
    if (feed.type === 'rss') {
      const { fetchRss } = require('./newsrss');
      return await fetchRss(feed.url, 5);
    }
    const { googleNews } = require('./newsrss');
    return await googleNews(feed.q, feed.region || 'PK', 5);
  } catch (e) {
    console.error(`[FEEDMON] feed error (${feed.label}):`, e.message);
    return [];
  }
}

function listFeeds(chatId) {
  const cfg = read(FEEDS_FILE);
  const feeds = cfg[chatId] || defaultFeeds();
  return feeds.map((f, i) => `${i + 1}. ${f.label}\n   _${f.q || f.url}_`);
}

function addFeed(chatId, q, label) {
  const cfg = read(FEEDS_FILE);
  const feeds = cfg[chatId] || defaultFeeds();
  const region = 'PK';
  feeds.push({ id: Date.now().toString(36), type: 'gnews', q, region, label: label || `🔍 ${q}` });
  cfg[chatId] = feeds;
  write(FEEDS_FILE, cfg);
  return feeds.length;
}

function removeFeed(chatId, idx) {
  const cfg = read(FEEDS_FILE);
  if (!cfg[chatId]) return null;
  const removed = cfg[chatId].splice(idx, 1)[0];
  if (!cfg[chatId].length) delete cfg[chatId];
  write(FEEDS_FILE, cfg);
  return removed;
}

async function pollOnce(sock) {
  const cfg = read(FEEDS_FILE);
  const seen = read(SEEN_FILE);
  const chats = Object.keys(cfg);
  if (!chats.length) return;

  for (const chatId of chats) {
    const feeds = cfg[chatId];
    let newItems = [];
    for (const feed of feeds) {
      try {
        const items = await fetchFeed(feed);
        for (const it of items) {
          const key = `${chatId}:${it.link}`;
          if (seen[key]) continue;
          seen[key] = true;
          newItems.push({ ...it, feedLabel: feed.label });
          if (newItems.length >= 3) break;
        }
      } catch (e) { console.error('[FEEDMON] poll error:', e.message); }
      if (newItems.length >= 3) break;
    }

    for (const it of newItems.slice(0, 3)) {
      try {
        const text =
          `📬 *NEW POST* — ${it.feedLabel}\n\n` +
          `*${it.title}*\n` +
          `🔗 ${it.link}\n` +
          `\n📡 Auto-post update | ABIX-AE`;
        await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD });
      } catch (e) { console.error('[FEEDMON] send fail:', e.message); }
    }
  }

  // prune seen older than 30 days
  try {
    const keys = Object.keys(seen);
    if (keys.length > 3000) {
      const pruned = {};
      const keep = keys.slice(-2000);
      for (const k of keep) pruned[k] = true;
      write(SEEN_FILE, pruned);
    } else {
      write(SEEN_FILE, seen);
    }
  } catch (e) {}
}

function start(sock) {
  stop();
  setTimeout(() => pollOnce(sock).catch(() => {}), 15000);
  timer = setInterval(() => pollOnce(sock).catch(() => {}), INTERVAL_MS);
  return timer;
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, pollOnce, listFeeds, addFeed, removeFeed, defaultFeeds, INTERVAL_MS };