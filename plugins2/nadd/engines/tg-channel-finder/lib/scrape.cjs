// Public Telegram scraping (no login): t.me/s/<channel> preview pages for
// post search, DuckDuckGo for channel discovery. Public channels only.
const { sleep } = require('./tgapi.cjs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const rand = (a, b) => a + Math.random() * (b - a);

async function fetchHtml(url, timeoutMs = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const stripTags = (s) =>
  String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Parse one t.me/s/<channel> page -> [{ postId, channel, msgId, link, text, date }]
function parseChannelPage(html, channel) {
  const out = [];
  const parts = html.split('data-post="');
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const idM = chunk.match(/^([^"]+)"/);
    if (!idM) continue;
    const postId = idM[1]; // "channel/123"
    const msgId = postId.split('/').pop();
    const textM = chunk.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
    const text = textM ? stripTags(textM[1]).slice(0, 1200) : '';
    const dateM = chunk.match(/datetime="([^"]+)"/);
    out.push({
      postId,
      channel,
      msgId,
      link: `https://t.me/${postId}`,
      text,
      date: dateM ? dateM[1].slice(0, 10) : '',
    });
  }
  return out;
}

function nextBefore(html) {
  const m = html.match(/data-before="(\d+)"/);
  return m ? m[1] : null;
}

// Channel meta from its public page.
async function channelInfo(channel) {
  const html = await fetchHtml(`https://t.me/s/${channel}`);
  const title = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i) || [])[1] || channel;
  const members = (html.match(/tgme_page_extra[^>]*>([^<]{1,60})</i) || [])[1] || '';
  const desc = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{0,200})/i) || [])[1] || '';
  if (/channel not found|not found/i.test(html.slice(0, 5000)) && !title) throw new Error('channel not found or private');
  return { channel, title: stripTags(title).slice(0, 80), members: members.trim(), description: stripTags(desc).slice(0, 160) };
}

// Search recent posts of ONE public channel for a query.
async function searchChannel(channel, query, maxPages = 3, onEvent = () => {}) {
  const q = query.toLowerCase();
  const posts = await fetchChannelPosts(channel, maxPages, onEvent);
  return posts.filter((m) => m.text && m.text.toLowerCase().includes(q));
}

// Fetch recent posts of a public channel (no filtering) — used by the indexer.
async function fetchChannelPosts(channel, maxPages = 10, onEvent = () => {}) {
  const posts = [];
  const seen = new Set();
  let before = null;
  for (let p = 0; p < maxPages; p++) {
    const url = before ? `https://t.me/s/${channel}?before=${before}` : `https://t.me/s/${channel}`;
    let html;
    try {
      html = await fetchHtml(url);
    } catch (e) {
      onEvent({ type: 'page-failed', channel, error: String(e.message).slice(0, 100) });
      break;
    }
    const msgs = parseChannelPage(html, channel);
    if (!msgs.length) break;
    for (const m of msgs) {
      if (!seen.has(m.postId)) { seen.add(m.postId); posts.push(m); }
    }
    onEvent({ type: 'page', channel, page: p + 1, posts: posts.length });
    before = nextBefore(html);
    if (!before) break;
    await sleep(rand(700, 1600));
  }
  posts.sort((a, b) => Number(b.msgId) - Number(a.msgId)); // newest first
  return posts;
}

// Discover public channels by keyword via DuckDuckGo (site:t.me).
async function discoverChannels(keyword, max = 10) {
  const queries = [`site:t.me ${keyword} telegram channel`, `site:t.me/s/ ${keyword}`];
  const found = new Map();
  for (const q of queries) {
    let html;
    try {
      html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
    } catch (_) { continue; }
    const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]{1,140}?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && found.size < max * 2) {
      const uddg = m[1].match(/[?&]uddg=([^&]+)/);
      if (!uddg) continue;
      let real;
      try { real = decodeURIComponent(uddg[1]); } catch (_) { continue; }
      const cm = real.match(/^https?:\/\/t\.me\/(s\/)?([A-Za-z0-9_]{5,64})/);
      if (!cm) continue;
      const name = cm[2].toLowerCase();
      if (['share', 'joinchat', 'addstickers'].includes(name)) continue;
      if (!found.has(name)) found.set(name, { channel: name, link: `https://t.me/${name}`, title: stripTags(m[2]).slice(0, 80) });
    }
    if (found.size >= max) break;
    await sleep(rand(800, 1600));
  }
  return [...found.values()].slice(0, max);
}

module.exports = { fetchHtml, stripTags, parseChannelPage, nextBefore, channelInfo, searchChannel, fetchChannelPosts, discoverChannels };
