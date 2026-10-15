// tg-finder: Telegram bot that searches public channel posts and discovers
// channels by keyword. Admin-only. Zero dependencies — Bot API long polling.
const fs = require('fs');
const path = require('path');
const { makeApi, esc, sleep } = require('./lib/tgapi.cjs');
const { loadStore, saveStore, normChannel } = require('./lib/store.cjs');
const { searchChannel, discoverChannels, channelInfo } = require('./lib/scrape.cjs');
const { indexPath, loadIndex, saveIndex, indexChannel, searchIndex, indexStats } = require('./lib/index.cjs');

const ROOT = __dirname;

function loadConfig() {
  const p = path.join(ROOT, 'config.json');
  if (!fs.existsSync(p)) {
    fs.copyFileSync(path.join(ROOT, 'config.example.json'), p);
    console.log('Created config.json — put your @BotFather token in it, then restart.');
    process.exit(0);
  }
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!c.token || c.token === 'PUT_BOT_TOKEN_HERE') {
    console.log('Set your bot token in config.json first (talk to @BotFather on Telegram).');
    process.exit(1);
  }
  return c;
}

const fmtMatch = (m) => {
  const snip = m.text.length > 280 ? m.text.slice(0, 280) + '…' : m.text;
  return `📢 <b>${esc(m.channel)}</b> ${m.date ? `<i>${esc(m.date)}</i>` : ''}\n${esc(snip)}\n<a href="${m.link}">open post</a>`;
};

async function cmdFind(ctx, args) {
  // /find searches the LOCAL INDEX (fast, deep history across all indexed channels)
  const query = args.join(' ');
  if (!query) {
    await ctx.reply('Usage: <code>/find &lt;query&gt;</code>\nSearches your indexed channels\' posts. Nothing indexed yet? <code>/deepfind &lt;query&gt;</code> finds channels AND searches them in one go.');
    return;
  }
  const hits = searchIndex(ctx.idx, query, 30);
  if (!hits.length) {
    const n = Object.keys(ctx.idx.channels).length;
    await ctx.reply(n ? `No matches for "${esc(query)}" in the index.` : 'Index is empty. <code>/deepfind &lt;query&gt;</code> to discover + index channels, or <code>/index &lt;channel&gt;</code>.');
    return;
  }
  for (let i = 0; i < Math.min(hits.length, 15); i += 5) {
    await ctx.api.sendMessage(ctx.chatId, hits.slice(i, i + 5).map(fmtMatch).join('\n\n'));
  }
  await ctx.reply(`✔ ${hits.length} match(es) for "${esc(query)}"${hits.length > 15 ? ' (showing 15)' : ''}.`);
}

async function cmdFindLive(ctx, args) {
  // /findlive searches saved watchlist channels live (no index needed)
  const query = args.filter((a) => !/^\d+$/.test(a)).join(' ');
  const pagesArg = args.find((a) => /^\d+$/.test(a));
  const pages = Math.min(10, Math.max(1, Number(pagesArg) || 3));
  const { store } = ctx;
  if (!store.channels.length) { await ctx.reply('No channels saved yet. <code>/add channelname</code> or <code>/csearch keyword</code> first.'); return; }
  await ctx.reply(`🔎 Searching <b>${esc(query)}</b> in ${store.channels.length} channel(s), ${pages} page(s) each…`);
  let total = 0;
  for (const ch of store.channels) {
    const matches = await searchChannel(ch, query, pages).catch(() => []);
    total += matches.length;
    for (let i = 0; i < matches.length; i += 5) {
      await ctx.api.sendMessage(ctx.chatId, matches.slice(i, i + 5).map(fmtMatch).join('\n\n'));
    }
    if (matches.length) await ctx.reply(`✔ <b>${esc(ch)}</b>: ${matches.length} match(es)`);
  }
  await ctx.reply(total ? `Done — <b>${total}</b> match(es) for "${esc(query)}".` : `No matches for "${esc(query)}" in saved channels.`);
}

async function cmdFindIn(ctx, args) {
  const channel = normChannel(args[0]);
  const query = args.slice(1).join(' ');
  if (!channel || !query) { await ctx.reply('Usage: <code>/findin channelname &lt;query&gt;</code>'); return; }
  await ctx.reply(`🔎 Searching <b>${esc(channel)}</b> for "${esc(query)}"…`);
  const matches = await searchChannel(channel, query, 5).catch(() => null);
  if (matches === null) { await ctx.reply('Channel not found or not public.'); return; }
  if (!matches.length) { await ctx.reply('No matches.'); return; }
  for (let i = 0; i < Math.min(matches.length, 15); i += 5) {
    await ctx.api.sendMessage(ctx.chatId, matches.slice(i, i + 5).map(fmtMatch).join('\n\n'));
  }
  await ctx.reply(`✔ ${matches.length} match(es)${matches.length > 15 ? ' (showing 15)' : ''}.`);
}

// /index <channel> [pages] — build/update the local post index for a channel
async function cmdIndex(ctx, args) {
  const channel = normChannel(args[0]);
  const pages = Math.min(30, Math.max(1, Number(args[1]) || 10));
  if (!channel) { await ctx.reply('Usage: <code>/index channelname [pages]</code>\nScrapes the channel\'s posts into your searchable index.'); return; }
  await ctx.reply(`📥 Indexing @${esc(channel)} (${pages} pages)…`);
  const r = await indexChannel(ctx.idx, channel, pages, async (e) => {
    if (e.type === 'page' && e.page % 5 === 0) { try { await ctx.reply(`…page ${e.page}, ${e.posts} posts so far`); } catch (_) {} }
  }).catch(() => null);
  if (!r) { await ctx.reply('Indexing failed — channel not found or not public.'); return; }
  ctx.saveIdx();
  await ctx.reply(`✔ @${esc(channel)}: +${r.added} new posts, ${r.total} total in index.\nNow <code>/find &lt;query&gt;</code> searches it instantly.`);
}

async function cmdIndexList(ctx) {
  const stats = indexStats(ctx.idx);
  if (!stats.length) { await ctx.reply('Index is empty. <code>/index &lt;channel&gt;</code> or <code>/deepfind &lt;query&gt;</code>.'); return; }
  const total = stats.reduce((s, x) => s + x.posts, 0);
  await ctx.reply(`Indexed channels (${stats.length}, ${total} posts):\n` + stats.map((s) => `• @${esc(s.channel)} — ${s.posts} posts (updated ${esc(s.indexedAt)})`).join('\n'));
}

// /deepfind <query> — the "@finding" one-shot: discover channels about the
// topic, index them, then search the index. Finds content, not just channels.
async function cmdDeepFind(ctx, args) {
  const query = args.join(' ');
  if (!query) { await ctx.reply('Usage: <code>/deepfind &lt;anything&gt;</code>\nDiscovers channels about the topic, indexes their posts, then searches inside them.'); return; }
  await ctx.reply(`🛰 Deep find: "${esc(query)}"\nStep 1/3 — discovering channels…`);
  const found = await discoverChannels(query, 6).catch(() => []);
  // also include already-indexed channels
  const targets = [...new Set([...found.map((f) => f.channel), ...Object.keys(ctx.idx.channels)])].slice(0, 8);
  if (!targets.length) { await ctx.reply('No channels discovered. Try another query.'); return; }
  await ctx.reply(`Step 2/3 — indexing ${targets.length} channel(s)… (a minute or two)`);
  for (const ch of targets) {
    await indexChannel(ctx.idx, ch, 8, () => {}).catch(() => {});
    ctx.saveIdx();
  }
  await ctx.reply('Step 3/3 — searching the index…');
  const hits = searchIndex(ctx.idx, query, 30);
  if (!hits.length) { await ctx.reply(`Indexed ${targets.length} channel(s) but found no posts matching "${esc(query)}".`); return; }
  for (let i = 0; i < Math.min(hits.length, 15); i += 5) {
    await ctx.api.sendMessage(ctx.chatId, hits.slice(i, i + 5).map(fmtMatch).join('\n\n'));
  }
  await ctx.reply(`✔ ${hits.length} match(es) across ${targets.length} channel(s)${hits.length > 15 ? ' (showing 15)' : ''}.`);
}

async function cmdAdd(ctx, args) {
  const { store, save } = ctx;
  const ch = normChannel(args[0]);
  if (!ch) { await ctx.reply('Usage: <code>/add channelname</code>'); return; }
  const info = await channelInfo(ch).catch(() => null);
  if (!info) { await ctx.reply('Channel not found or not public.'); return; }
  if (!store.channels.includes(ch)) { store.channels.push(ch); save(); }
  await ctx.reply(`✔ Added <b>${esc(info.title)}</b> (@${esc(ch)})${info.members ? ` — ${esc(info.members)}` : ''}`);
}

async function cmdDel(ctx, args) {
  const { store, save } = ctx;
  const ch = normChannel(args[0]);
  store.channels = store.channels.filter((c) => c !== ch);
  save();
  await ctx.reply(`Removed @${esc(ch)}. ${store.channels.length} channel(s) left.`);
}

async function cmdList(ctx) {
  const { store } = ctx;
  await ctx.reply(store.channels.length ? 'Saved channels:\n' + store.channels.map((c) => `• @${esc(c)}`).join('\n') : 'No channels saved. <code>/csearch keyword</code> to discover some.');
}

async function cmdCsearch(ctx, args) {
  const keyword = args.join(' ');
  if (!keyword) { await ctx.reply('Usage: <code>/csearch keyword</code>\nFinds public Telegram channels about a topic.'); return; }
  await ctx.reply(`🔎 Discovering channels for "${esc(keyword)}"…`);
  const found = await discoverChannels(keyword, 10).catch(() => []);
  if (!found.length) { await ctx.reply('Nothing found. Try another keyword.'); return; }
  await ctx.reply('Channels found:\n\n' + found.map((f, i) =>
    `${i + 1}. <b>${esc(f.title || f.channel)}</b>\n   <a href="${f.link}">@${esc(f.channel)}</a> — <code>/add ${esc(f.channel)}</code>`
  ).join('\n\n'));
}

async function cmdInfo(ctx, args) {
  const ch = normChannel(args[0]);
  if (!ch) { await ctx.reply('Usage: <code>/info channelname</code>'); return; }
  const info = await channelInfo(ch).catch(() => null);
  if (!info) { await ctx.reply('Channel not found or not public.'); return; }
  await ctx.reply(`<b>${esc(info.title)}</b> (@${esc(ch)})\n${esc(info.members)}\n${esc(info.description)}\n<a href="https://t.me/${esc(ch)}">open channel</a>`);
}

async function cmdHelp(ctx) {
  await ctx.reply(
`<b>tg-finder commands — content search, @finding style</b>
<code>/deepfind &lt;anything&gt;</code> — discover channels + index + search, one shot
<code>/find &lt;query&gt;</code> — instant search across your indexed posts
<code>/index &lt;channel&gt; [pages]</code> — index a channel's posts (deep history)
<code>/indexlist</code> — what's in your index
<code>/findlive &lt;query&gt; [pages]</code> — live search in watchlist channels
<code>/findin &lt;channel&gt; &lt;query&gt;</code> — one-off live search, any public channel
<code>/add &lt;channel&gt;</code> / <code>/del &lt;channel&gt;</code> / <code>/list</code> — watchlist
<code>/csearch &lt;keyword&gt;</code> — discover public channels by topic
<code>/info &lt;channel&gt;</code> — title + subscribers
<code>/help</code> — this help

Public channels only. Get a token from @BotFather, put it in config.json.`
  );
}

const COMMANDS = { find: cmdFind, findlive: cmdFindLive, findin: cmdFindIn, deepfind: cmdDeepFind, index: cmdIndex, indexlist: cmdIndexList, add: cmdAdd, del: cmdDel, list: cmdList, csearch: cmdCsearch, info: cmdInfo, help: cmdHelp, start: cmdHelp };

async function main() {
  const config = loadConfig();
  const api = makeApi(config.token);
  const store = loadStore(path.join(ROOT, config.dataFile || './data.json'));
  const save = () => saveStore(path.join(ROOT, config.dataFile || './data.json'), store);
  const idxFile = indexPath(ROOT, config.dataFile || './data.json');
  const idx = loadIndex(idxFile);
  const saveIdx = () => saveIndex(idxFile, idx);
  const me = await api.call('getMe');
  console.log(`tg-finder running as @${me.username}. Admins: ${config.admins && config.admins.length ? config.admins.join(',') : '(auto-claim on first /start)'}`);

  let offset = 0;
  for (;;) {
    let updates;
    try {
      updates = await api.getUpdates(offset, config.pollTimeoutSec || 30);
    } catch (e) {
      console.error('poll error:', e.message);
      await sleep(3000);
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (!msg || !msg.text) continue;
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const text = msg.text.trim();
      if (!text.startsWith('/')) continue;

      // admin gate (auto-claim when empty)
      if (!config.admins || !config.admins.length) {
        config.admins = [userId];
        fs.writeFileSync(path.join(ROOT, 'config.json'), JSON.stringify(config, null, 2));
        console.log(`Admin auto-claimed: ${userId}`);
      }
      if (!config.admins.includes(userId)) {
        console.log(`Blocked non-admin ${userId}`);
        continue;
      }

      const parts = text.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase().split('@')[0];
      const args = parts.slice(1);
      const fn = COMMANDS[cmd];
      const ctx = { api, chatId, userId, store, save, idx, saveIdx, reply: (t) => api.sendMessage(chatId, t) };
      if (!fn) { await ctx.reply('Unknown command. /help'); continue; }
      try {
        await fn(ctx, args);
      } catch (e) {
        console.error('command error:', e.message);
        await ctx.reply('Error: ' + esc(e.message).slice(0, 200)).catch(() => {});
      }
    }
  }
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
