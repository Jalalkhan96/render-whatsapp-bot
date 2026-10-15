'use strict';

/**
 * qa-core.cjs
 * Shared query/search + slider + download engine for the 10 supplied
 * knowledge/developer-site scrapers.
 *
 * Fixed behavior:
 *   - exactly TOP 5 results per query
 *   - WhatsApp carousel when supported, with clean relay (no fake-forward)
 *   - every card gets a DOWNLOAD quick-reply
 *   - download is an ephemeral text/markdown snapshot; direct small files are
 *     also supported
 *   - ownerOnly=true on all commands; the bot's owner resolver decides whether
 *     the primary/secondary owner is allowed
 *   - no persistent cache/database; only a small in-memory last-result map
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOP = 5;
const SESSION_TTL = 15 * 60 * 1000;
const MAX_SESSIONS = 100;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
const UA = 'ABIX-QA-Scrapers/1.0 (+live-results)';

const sessions = new Map();

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function cleanText(value, max = 500) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 10) || 0, 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16) || 0, 0x10ffff)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchText(url, opts = {}) {
  const headers = Object.assign({
    'User-Agent': UA,
    'Accept': '*/*',
  }, opts.headers || {});
  const response = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    signal: opts.signal || AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${opts.label || 'request'} failed: HTTP ${response.status}`);
  }
  return { response, text };
}

async function fetchJson(url, opts = {}) {
  const { response, text } = await fetchText(url, {
    ...opts,
    headers: { 'Accept': 'application/json, text/plain, */*', ...(opts.headers || {}) },
  });
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`${opts.label || 'API'} returned invalid JSON`); }
  return { response, data };
}

function hostIcon(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return 'https://www.google.com/s2/favicons?domain=example.com&sz=128';
  }
}

function normalizeItem(item, source) {
  return {
    source: source.label,
    sourceKey: source.key,
    title: cleanText(item.title || item.name || item.repo || 'Untitled', 140),
    description: cleanText(item.description || item.brief || item.subtitle || item.selftext_preview || '', 280),
    url: item.url || item.link || item.permalink || null,
    author: cleanText(item.author || item.submitter || '', 80),
    score: item.score ?? item.reactions ?? item.claps ?? null,
    meta: cleanText(item.meta || item.tags || item.language || item.type || '', 120),
    thumbnail: item.thumbnail || item.image || null,
    raw: item,
  };
}

function sessionKey() {
  return crypto.randomBytes(5).toString('hex');
}

function saveSession(chatId, items, query, source) {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (now - v.at > SESSION_TTL) sessions.delete(k);
  }
  while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  const token = sessionKey();
  sessions.set(token, { chatId, items, query, source, at: now });
  return token;
}

function getSession(token, chatId) {
  const state = sessions.get(String(token || ''));
  if (!state || state.chatId !== chatId || Date.now() - state.at > SESSION_TTL) {
    if (token) sessions.delete(String(token));
    return null;
  }
  return state;
}

function getPrefix(context) {
  return context?.prefix || '-';
}

function fallbackText(items, source, query, token, prefix) {
  const lines = items.slice(0, TOP).map((x, i) => {
    const meta = [x.author, x.meta].filter(Boolean).join(' • ');
    return `${i + 1}. ${x.title}${meta ? `\n   ${meta}` : ''}\n   ${x.url || '(no URL)'}`;
  });
  return [
    `🔎 *${source.label.toUpperCase()} SEARCH*`,
    `Query: *${cleanText(query, 80)}*`,
    '',
    ...lines,
    '',
    `⬇️ Download: ${prefix}qadl ${token} 1-5`,
    `🔗 Open: ${prefix}qaopen ${token} 1-5`,
  ].join('\n');
}

async function sendSlider(sock, chatId, message, items, source, query, token, prefix) {
  let slider = null;
  try { slider = require('./pplib/slider.cjs'); } catch { /* older bot: use text fallback */ }
  if (!slider?.sendSlider) return false;

  const cards = items.slice(0, TOP).map((x, i) => ({
    title: `${i + 1}. ${cleanText(x.title, 55)}`,
    body: [
      cleanText(x.description, 170),
      x.author ? `👤 ${x.author}` : '',
      x.meta ? `ℹ️ ${x.meta}` : '',
    ].filter(Boolean).join('\n'),
    footer: source.label,
    imageUrl: x.thumbnail || hostIcon(x.url || source.home),
    buttons: [
      { text: '⬇️ DOWNLOAD', id: `${prefix}qadl ${token} ${i + 1}` },
      { text: '🔗 OPEN', id: `${prefix}qaopen ${token} ${i + 1}` },
    ],
  }));

  try {
    return await slider.sendSlider(sock, chatId, {
      bodyText: `🔎 *${source.label}*\nQuery: *${cleanText(query, 60)}*\nSwipe → choose an item`,
      footerText: 'Live results • Top 5 • Clean slider',
      items: cards,
      maxCards: TOP,
    });
  } catch {
    return false;
  }
}

async function sendResults(sock, chatId, message, source, query, items, context) {
  const trimmed = items.slice(0, TOP).filter(x => x?.url || x?.title);
  if (!trimmed.length) {
    await sock.sendMessage(chatId, { text: `❌ No results found on ${source.label} for "${cleanText(query, 80)}".` }, { quoted: message });
    return;
  }
  const token = saveSession(chatId, trimmed, query, source);
  const prefix = getPrefix(context);
  const shown = await sendSlider(sock, chatId, message, trimmed, source, query, token, prefix);
  if (!shown) {
    await sock.sendMessage(chatId, { text: fallbackText(trimmed, source, query, token, prefix) }, { quoted: message });
  }
}

function simpleSource(key, label, home, searchFn) {
  return { key, label, home, search: searchFn };
}

async function stackSearch(query, site) {
  const params = new URLSearchParams({ order: 'desc', sort: 'relevance', site, pagesize: String(TOP), intitle: query });
  const { data } = await fetchJson(`https://api.stackexchange.com/2.3/search/advanced?${params}`, { label: `${site} search` });
  if (data.error_id) throw new Error(`Stack Exchange error ${data.error_message || data.error_id}`);
  return (data.items || []).slice(0, TOP).map(q => ({
    title: q.title,
    url: q.link,
    author: q.owner?.display_name || 'unknown',
    score: q.score,
    meta: `${q.answer_count ?? 0} answers • ${q.view_count ?? 0} views${q.is_answered ? ' • answered' : ''}`,
    description: Array.isArray(q.tags) ? q.tags.join(', ') : '',
  }));
}

async function redditSearch(query) {
  const params = new URLSearchParams({ q: query, sort: 'relevance', limit: String(TOP), type: 'link', raw_json: '1' });
  const { data } = await fetchJson(`https://www.reddit.com/search.json?${params}`, { label: 'Reddit search', headers: { 'User-Agent': UA } });
  const children = data?.data?.children || [];
  return children.slice(0, TOP).map(c => {
    const d = c.data || {};
    return {
      title: d.title,
      url: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url,
      author: d.author || 'unknown',
      score: d.score,
      meta: `${d.num_comments ?? 0} comments${d.subreddit ? ` • r/${d.subreddit}` : ''}`,
      description: (d.selftext || d.url || '').slice(0, 240),
      thumbnail: /^https?:\/\//i.test(d.thumbnail || '') ? d.thumbnail : null,
    };
  });
}

async function hackerNewsSearch(query) {
  const params = new URLSearchParams({ query, tags: 'story', hitsPerPage: String(TOP) });
  const { data } = await fetchJson(`https://hn.algolia.com/api/v1/search?${params}`, { label: 'Hacker News search' });
  return (data.hits || []).slice(0, TOP).map(h => ({
    title: h.title || h.story_title,
    url: h.url || (h.objectID ? `https://news.ycombinator.com/item?id=${h.objectID}` : null),
    author: h.author || 'unknown',
    score: h.points,
    meta: `${h.num_comments ?? 0} comments`,
    description: h._highlightResult?.title?.value || '',
  }));
}

async function devSearch(query) {
  const params = new URLSearchParams({ q: query, per_page: String(TOP), page: '1' });
  const { data } = await fetchJson(`https://dev.to/api/articles/search?${params}`, { label: 'DEV search' });
  if (!Array.isArray(data)) throw new Error('DEV search returned an unexpected payload');
  return data.slice(0, TOP).map(a => ({
    title: a.title,
    url: a.url || a.canonical_url,
    author: a.user?.username || a.user?.name || 'unknown',
    score: a.positive_reactions_count,
    meta: Array.isArray(a.tag_list) ? a.tag_list.join(', ') : '',
    description: a.description || '',
    thumbnail: a.cover_image || a.social_image || null,
  }));
}

function stripText(s) { return cleanText(String(s || '').replace(/<[^>]+>/g, ' '), 500); }

async function lobstersSearch(query) {
  const params = new URLSearchParams({ q: query, what: 'stories', order: 'relevance' });
  const { text } = await fetchText(`https://lobste.rs/search?${params}`, { label: 'Lobsters search' });
  const blocks = text.match(/<li id="story_[^"]+"[\s\S]*?<\/li>/gi) || [];
  const items = [];
  for (const block of blocks) {
    const mUrl = block.match(/<a[^>]+class="u-url"[^>]+href="([^"]+)"/i);
    const mTitle = block.match(/<a[^>]+class="u-url"[^>]*>([\s\S]*?)<\/a>/i);
    const mScore = block.match(/<a[^>]+class="upvoter"[^>]*>\s*(\d+)\s*<\/a>/i);
    const mAuthor = block.match(/u-author h-card[^>]*>\s*([^<]+)/i);
    const mComments = block.match(/href="(\/s\/[^\"]+)"[^>]*>\s*(\d+)\s+comments?/i);
    if (!mUrl || !mTitle) continue;
    const u = /^https?:/i.test(mUrl[1]) ? mUrl[1] : new URL(mUrl[1], 'https://lobste.rs').href;
    items.push({ title: stripText(mTitle[1]), url: u, author: stripText(mAuthor?.[1] || ''), score: mScore ? Number(mScore[1]) : null, meta: mComments ? `${mComments[2]} comments` : 'Lobsters', description: '' });
    if (items.length >= TOP) break;
  }
  if (!items.length) throw new Error('Lobsters returned no parseable story results');
  return items;
}

async function githubSearch(query) {
  const params = new URLSearchParams({ q: query, per_page: String(TOP), sort: 'stars', order: 'desc' });
  const { data } = await fetchJson(`https://api.github.com/search/repositories?${params}`, {
    label: 'GitHub repository search',
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
  });
  return (data.items || []).slice(0, TOP).map(r => ({
    title: r.full_name || r.name,
    url: r.html_url,
    author: r.owner?.login || '',
    score: r.stargazers_count,
    meta: `${r.language || 'unknown'} • ${r.forks_count ?? 0} forks • ${r.open_issues_count ?? 0} issues`,
    description: r.description || '',
    thumbnail: r.owner?.avatar_url || null,
  }));
}

async function hashnodeSearch() {
  throw new Error('Hashnode GraphQL read API now requires Pro access; no free live search endpoint is configured.');
}

async function productHuntSearch(queryText) {
  const token = process.env.PRODUCT_HUNT_TOKEN || process.env.PH_API_TOKEN || process.env.PRODUCTHUNT_TOKEN;
  if (!token) throw new Error('Product Hunt requires PRODUCT_HUNT_TOKEN (API v2) for live API access.');
  // Product Hunt v2 exposes topic query but not a generic post-text search argument.
  // Resolve the query to a topic, then return the latest posts in that topic.
  const gql = `query SearchTopicAndPosts($q: String!) {
    topics(query: $q, first: 1) {
      nodes { slug name }
    }
  }`;
  const response = await fetch('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: gql, variables: { q: queryText } }),
    signal: AbortSignal.timeout(25_000),
  });
  const data = await response.text().then(t => { try { return JSON.parse(t); } catch { return null; } });
  if (!response.ok) throw new Error(`Product Hunt API HTTP ${response.status}`);
  if (data?.errors?.length) throw new Error(`Product Hunt API: ${data.errors[0].message}`);
  const topic = data?.data?.topics?.nodes?.[0];
  if (!topic?.slug) throw new Error(`No Product Hunt topic matched "${cleanText(queryText, 60)}".`);

  const postsQuery = `query TopicPosts($topic: String!) {
    posts(first: 5, topic: $topic, order: NEWEST) {
      nodes { id name tagline url website votesCount commentsCount thumbnail { url } }
    }
  }`;
  const postsResponse = await fetch('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: postsQuery, variables: { topic: topic.slug } }),
    signal: AbortSignal.timeout(25_000),
  });
  const postsData = await postsResponse.text().then(t => { try { return JSON.parse(t); } catch { return null; } });
  if (!postsResponse.ok) throw new Error(`Product Hunt API HTTP ${postsResponse.status}`);
  if (postsData?.errors?.length) throw new Error(`Product Hunt API: ${postsData.errors[0].message}`);
  const nodes = postsData?.data?.posts?.nodes || [];
  return nodes.slice(0, TOP).map(p => ({
    title: p.name, url: p.url, description: p.tagline || '',
    meta: `${topic.name} • ${p.votesCount ?? 0} votes • ${p.commentsCount ?? 0} comments`,
    thumbnail: p.thumbnail?.url || null,
  }));
}

async function mediumSearch(query) {
  const url = `https://medium.com/search?q=${encodeURIComponent(query)}`;
  const { text } = await fetchText(url, { label: 'Medium search', headers: { Accept: 'text/html,application/xhtml+xml' } });
  if (/Just a moment|Attention Required|cf-challenge/i.test(text)) {
    throw new Error('Medium returned a bot-protection page.');
  }
  const seen = new Set();
  const items = [];
  const rx = /<a[^>]+href="(https:\/\/medium\.com\/[^"#?]+|\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = rx.exec(text))) {
    const href = /^https?:/i.test(m[1]) ? m[1] : `https://medium.com${m[1]}`;
    if (!/^https:\/\/medium\.com\/(?:@[^/]+\/|[^/]+\/)[^/]+/.test(href)) continue;
    const title = stripText(m[2]);
    if (!title || title.length < 4 || seen.has(href)) continue;
    seen.add(href);
    items.push({ title, url: href, description: '', meta: 'Medium' });
    if (items.length >= TOP) break;
  }
  if (!items.length) throw new Error('Medium search page returned no parseable results.');
  return items;
}

const SOURCES = {
  so: simpleSource('so', 'Stack Overflow', 'https://stackoverflow.com', q => stackSearch(q, 'stackoverflow')),
  se: simpleSource('se', 'Stack Exchange', 'https://stackexchange.com', async q => stackSearch(q, 'superuser')),
  reddit: simpleSource('reddit', 'Reddit', 'https://www.reddit.com', redditSearch),
  hn: simpleSource('hn', 'Hacker News', 'https://news.ycombinator.com', hackerNewsSearch),
  devto: simpleSource('devto', 'DEV Community', 'https://dev.to', devSearch),
  lobsters: simpleSource('lobsters', 'Lobsters', 'https://lobste.rs', lobstersSearch),
  ghtrend: simpleSource('ghtrend', 'GitHub', 'https://github.com/trending', githubSearch),
  hashnode: simpleSource('hashnode', 'Hashnode', 'https://hashnode.com', hashnodeSearch),
  producthunt: simpleSource('producthunt', 'Product Hunt', 'https://www.producthunt.com', async q => productHuntSearch(q)),
  medium: simpleSource('medium', 'Medium', 'https://medium.com', mediumSearch),
};

async function downloadSnapshot(sock, chatId, message, token, index, context) {
  const state = getSession(token, chatId);
  const n = Number(index);
  if (!state) return sock.sendMessage(chatId, { text: '❌ This result list expired. Run the search again.' }, { quoted: message });
  if (!Number.isInteger(n) || n < 1 || n > state.items.length) {
    return sock.sendMessage(chatId, { text: `❌ Result number must be 1-${state.items.length}.` }, { quoted: message });
  }

  const item = state.items[n - 1];
  const url = item.url;
  if (!url) return sock.sendMessage(chatId, { text: '❌ This result has no downloadable URL.' }, { quoted: message });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/markdown,text/html,application/json;q=0.9,*/*;q=0.5' },
      signal: AbortSignal.timeout(30_000),
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const length = Number(response.headers.get('content-length') || 0);

    if (length > MAX_MEDIA_BYTES) {
      return sock.sendMessage(chatId, { text: `⚠️ The source file is larger than the safe download limit.\n\n🔗 ${url}` }, { quoted: message });
    }

    if (/^(application\/pdf|image\/|audio\/|video\/|application\/zip)/.test(contentType)) {
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length > MAX_MEDIA_BYTES) return sock.sendMessage(chatId, { text: `⚠️ File is larger than ${MAX_MEDIA_BYTES / (1024 * 1024)} MB.\n\n🔗 ${url}` }, { quoted: message });
      const safeName = `${String(state.source.key).replace(/[^a-z0-9_-]/gi, '_')}-${n}.${contentType.includes('pdf') ? 'pdf' : contentType.includes('image/') ? 'bin' : contentType.includes('video/') ? 'mp4' : 'bin'}`;
      return sock.sendMessage(chatId, {
        document: buf,
        fileName: safeName,
        mimetype: contentType.split(';')[0] || 'application/octet-stream',
        caption: `📥 ${item.title}\n🌐 ${url}`,
      }, { quoted: message });
    }

    const raw = await response.text();
    const body = /^text\/markdown/i.test(contentType) ? raw : stripHtml(raw);
    const header = [
      `# ${item.title}`,
      `Source: ${state.source.label}`,
      `URL: ${url}`,
      item.author ? `Author: ${item.author}` : '',
      item.meta ? `Info: ${item.meta}` : '',
      '',
    ].filter(Boolean).join('\n');
    const finalText = (header + body).slice(0, MAX_TEXT_BYTES);
    const outName = `${state.source.key}-${n}.txt`;
    return sock.sendMessage(chatId, {
      document: Buffer.from(finalText, 'utf8'),
      fileName: outName,
      mimetype: 'text/plain',
      caption: `📥 Downloaded result #${n}`,
    }, { quoted: message });
  } catch (err) {
    return sock.sendMessage(chatId, {
      text: `⚠️ Download could not be fetched from the source.\n\n${cleanText(err.message, 180)}\n\n🔗 ${url}`,
    }, { quoted: message });
  }
}

async function openResult(sock, chatId, message, token, index) {
  const state = getSession(token, chatId);
  const n = Number(index);
  if (!state) return sock.sendMessage(chatId, { text: '❌ This result list expired. Run the search again.' }, { quoted: message });
  if (!Number.isInteger(n) || n < 1 || n > state.items.length) return sock.sendMessage(chatId, { text: `❌ Result number must be 1-${state.items.length}.` }, { quoted: message });
  return sock.sendMessage(chatId, {
    text: `🔗 *${state.items[n - 1].title}*\n\n${state.items[n - 1].url || 'No URL'}`,
  }, { quoted: message });
}

function parseQuery(args) {
  return (Array.isArray(args) ? args : []).map(String).join(' ').trim();
}

function createSiteCommand(command, aliases, sourceKey) {
  const source = SOURCES[sourceKey];
  return {
    command,
    aliases,
    category: 'search',
    ownerOnly: true,
    description: `Owner-only live top-5 ${source.label} query with WhatsApp slider and download`,
    usage: `-${command} <query>`,
    async handler(sock, message, args = [], context = {}) {
      const chatId = context.chatId || message.key.remoteJid;
      const query = parseQuery(args);
      if (!query) return sock.sendMessage(chatId, { text: `Usage: ${getPrefix(context)}${command} <query>\n\nReturns top 5 live results in a slider.` }, { quoted: message });
      const status = await sock.sendMessage(chatId, { text: `🔎 Searching *${source.label}* for "${cleanText(query, 70)}"…` }, { quoted: message });
      try {
        const items = await source.search(query);
        try { if (status?.key) await sock.sendMessage(chatId, { delete: status.key }); } catch { /* ignore */ }
        return sendResults(sock, chatId, message, source, query, items.map(i => normalizeItem(i, source)), context);
      } catch (err) {
        try { if (status?.key) await sock.sendMessage(chatId, { delete: status.key }); } catch { /* ignore */ }
        return sock.sendMessage(chatId, {
          text: `❌ *${source.label}* search failed.\n\n${cleanText(err.message, 400)}\n\nNo fake/offline results were generated.`,
        }, { quoted: message });
      }
    },
  };
}

const qaDownload = {
  command: 'qadl',
  aliases: ['qdownload'],
  category: 'search',
  ownerOnly: true,
  description: 'Download a result from the last QA search slider',
  usage: '-qadl <token> <1-5>',
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    return downloadSnapshot(sock, chatId, message, args[0], args[1], context);
  },
};

const qaOpen = {
  command: 'qaopen',
  aliases: ['qopen'],
  category: 'search',
  ownerOnly: true,
  description: 'Open/send the URL for a QA search result',
  usage: '-qaopen <token> <1-5>',
  async handler(sock, message, args = []) {
    const chatId = message.key.remoteJid;
    return openResult(sock, chatId, message, args[0], args[1]);
  },
};

const qaMenu = {
  command: 'qamenu',
  aliases: ['qsites'],
  category: 'search',
  ownerOnly: true,
  description: 'Show live QA scraper commands',
  usage: '-qamenu',
  async handler(sock, message, args, context = {}) {
    const p = getPrefix(context);
    const rows = [
      ['Stack Overflow', 'qaso'], ['Stack Exchange', 'qase'], ['Reddit', 'qareddit'], ['Hacker News', 'qahn'],
      ['DEV', 'qadev'], ['Lobsters', 'qalobsters'], ['GitHub', 'qagh'], ['Hashnode', 'qahashnode'],
      ['Product Hunt', 'qaph'], ['Medium', 'qamedium'],
    ];
    const text = [
      '🧠 *ABIX LIVE QA SCRAPERS*',
      '',
      'Top 5 live results → clean WhatsApp slider → ⬇️ DOWNLOAD',
      '',
      ...rows.map(([label, cmd]) => `• ${label}: ${p}${cmd} <query>`),
      '',
      `Every command is owner-only. Results are live; no fake cached data.`,
      `Download manually: ${p}qadl <token> <1-5>`,
    ].join('\n');
    return sock.sendMessage(context.chatId || message.key.remoteJid, { text }, { quoted: message });
  },
};

module.exports = {
  TOP,
  SOURCES,
  createSiteCommand,
  qaDownload,
  qaOpen,
  qaMenu,
};
