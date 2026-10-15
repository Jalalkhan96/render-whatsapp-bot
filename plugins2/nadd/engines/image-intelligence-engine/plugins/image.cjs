'use strict';
/**
 * WhatsApp plugin: Image Intelligence Engine (100 sources).
 *
 * Contract (wa-broadcast-suite style):
 *   module.exports = { name, description, commands: { <cmd>: async (ctx, args, text) => {} } }
 * ctx: { reply, line:{sock}, chatJid, msg, dataDir, config, senderJid, prefix, isOwner }
 *
 * Also exports execute() for {sock,msg,args,text,sender,isOwner,reply}-style bots.
 *
 * Prefix: '-' (matches bot convention). Usage: -image sunset --limit 20
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { ImageSearchEngine } = require(path.join(ROOT, 'lib', 'engine.js'));
const { parseFlags } = require(path.join(ROOT, 'lib', 'query.js'));
const { attributionText } = require(path.join(ROOT, 'lib', 'license.js'));
const { BaseImageSource } = require(path.join(ROOT, 'lib', 'base-source.js'));
const registry = require(path.join(ROOT, 'lib', 'registry.js'));

const engine = new ImageSearchEngine();

// per-chat pagination sessions with TTL
const sessions = new Map(); // chatJid -> { results, page, query, command, ts }
const PAGE_SIZE = 5;
const SESSION_TTL = 10 * 60 * 1000;
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of sessions) if (t - v.ts > SESSION_TTL) sessions.delete(k);
}, 60000).unref();

function licenseLine(img) {
  let l = img.license || 'Unknown';
  if (img.licenseUnknown) l += ' (unverified — check source)';
  if (img.attributionRequired) l += ' · attribution required';
  if (img.commercialUse === true) l += ' · commercial OK';
  else if (img.commercialUse === false) l += ' · NOT for commercial use';
  return l;
}

function fmtResult(img, i, showDl) {
  const size = (img.width && img.height) ? `${img.width}×${img.height}` : 'size?';
  const lines = [
    `${i + 1}. 🖼️ ${img.title || '(untitled)'}`,
    `   Source: ${img.source}`,
    img.creator ? `   Creator: ${img.creator}` : null,
    `   Size: ${size}${img.orientation ? ` (${img.orientation})` : ''}`,
    `   License: ${licenseLine(img)}`,
    `   🔗 ${img.sourceUrl || img.imageUrl}`,
  ].filter(Boolean);
  if (showDl && img.sourceKey) lines.push(`   ⬇️ -imgdl ${img.sourceKey} ${img.sourceId || i + 1}`);
  if (img.score !== undefined) lines.push(`   ⭐ ${img.score}/100 — ${img.reasons.join(', ')}`);
  return lines.join('\n');
}

function fmtPage(sess) {
  const { results, page, query, command } = sess;
  const total = results.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(page, pages - 1);
  const slice = results.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
  const head = [
    '🖼️ IMAGE SEARCH', '',
    `Query: ${query}`,
    `Mode: ${command}`,
    `Found: ${total} results (page ${p + 1}/${pages})`, '',
  ];
  const body = slice.map((img, k) => fmtResult(img, p * PAGE_SIZE + k, true)).join('\n\n');
  const foot = pages > 1 ? `\n\n-next / -prev to page` : '';
  return head.join('\n') + (body ? body + foot : 'No results.' + foot);
}

async function sendThumbs(ctx, results) {
  const sock = ctx.line && ctx.line.sock;
  if (!sock) return;
  for (const img of results.slice(0, 3)) {
    const u = img.thumbnailUrl || img.imageUrl;
    if (!u || img.format === 'svg') continue;
    try {
      await sock.sendMessage(ctx.chatJid,
        { image: { url: u }, caption: `🖼️ ${img.title || ''}\n${img.source}${img.creator ? ' · ' + img.creator : ''}\nLicense: ${licenseLine(img)}` },
        { quoted: ctx.msg });
    } catch (_) { /* thumbnail send is best-effort */ }
  }
}

async function runSearch(ctx, args, command, opts = {}) {
  const { query, filters } = parseFlags(args.join(' '));
  if (!query) {
    await ctx.reply(`Usage: -${command} <query> [flags]\nFlags: --limit N --landscape --portrait --square --4k --hd --transparent --commercial --cc0 --public-domain --license <v> --no-attribution --min-width N --min-height N --color <name>`);
    return;
  }
  if (opts.extraArgs) Object.assign(filters, opts.extraArgs);
  await ctx.reply(`🔎 Searching ${command} for "${query}"…`);
  try {
    const out = await engine.search(query, {
      command,
      filters,
      maxResults: opts.maxResults || filters.limit || undefined,
      maxSources: opts.maxSources,
    });
    if (!out.results.length) {
      await ctx.reply(`🖼️ No results for "${query}" (${out.sourcesUsed.length} sources tried${out.failures.length ? `, ${out.failures.length} failed` : ''}).`);
      return;
    }
    const sess = { results: out.results, page: 0, query, command, ts: Date.now() };
    sessions.set(ctx.chatJid, sess);
    if (opts.urlsOnly) {
      await ctx.reply('🔗 IMAGE URLS\n' + out.results.map((r, i) => `${i + 1}. ${r.imageUrl}`).join('\n'));
      return;
    }
    if (opts.groupBySource) {
      const groups = {};
      for (const r of out.results) (groups[r.source] = groups[r.source] || []).push(r);
      let txt = `🖼️ IMAGE COMPARE — "${query}"\n`;
      for (const [src, arr] of Object.entries(groups)) {
        txt += `\n━━ ${src} (${arr.length}) ━━\n` + arr.slice(0, 2).map((r, i) => fmtResult(r, i, false)).join('\n\n');
      }
      await ctx.reply(txt);
      return;
    }
    await ctx.reply(fmtPage(sess));
    await sendThumbs(ctx, out.results);
  } catch (e) {
    await ctx.reply(`Search failed: ${String((e && e.message) || e).slice(0, 300)}`);
  }
}

function findInSession(ctx, ref) {
  const sess = sessions.get(ctx.chatJid);
  if (!sess) return { error: 'No active search. Run -image <query> first.' };
  const n = parseInt(ref, 10);
  if (Number.isFinite(n) && n >= 1 && n <= sess.results.length) {
    return { img: sess.results[n - 1], index: n };
  }
  return { error: `Not found. Use a result number 1-${sess.results.length} from your last search.` };
}

async function cmdImageDetail(ctx, args) {
  const ref = args[0];
  if (!ref) { await ctx.reply('Usage: -imagedetail <number|source:id>\nExample: -imagedetail 3  or  -imagedetail unsplash:abc123'); return; }
  let img = null;
  if (ref.includes(':')) {
    const [sourceId, ...rest] = ref.split(':');
    try { img = await engine.getImage(rest.join(':'), sourceId); }
    catch (e) { await ctx.reply(`Lookup failed: ${String((e && e.message) || e).slice(0, 200)}`); return; }
  } else {
    const f = findInSession(ctx, ref);
    if (f.error) { await ctx.reply(f.error); return; }
    img = f.img;
  }
  const size = (img.width && img.height) ? `${img.width}×${img.height} (${img.aspectRatio})` : '?';
  await ctx.reply([
    '🖼️ IMAGE DETAILS', '',
    `Title: ${img.title || '(untitled)'}`,
    `Creator: ${img.creator || '?'}${img.creatorUrl ? `\nCreator URL: ${img.creatorUrl}` : ''}`,
    `Dimensions: ${size}${img.format ? ` · ${img.format}` : ''}`,
    `Source: ${img.source}`,
    `Source URL: ${img.sourceUrl || '?'}`,
    `Image URL: ${img.imageUrl || '?'}`,
    `License: ${licenseLine(img)}`,
    img.licenseUrl ? `License URL: ${img.licenseUrl}` : null,
    `Tags: ${(img.tags || []).slice(0, 10).join(', ') || '—'}`,
    `Attribution: ${attributionText(img)}`,
    img.alsoFrom && img.alsoFrom.length ? `Also from: ${img.alsoFrom.map((a) => a.source).join(', ')}` : null,
  ].filter(Boolean).join('\n'));
}

async function cmdImgDl(ctx, args) {
  const ref = args.join(' ').trim();
  if (!ref) { await ctx.reply('Usage: -imgdl <number|source id|image URL>\nExamples:\n-imgdl 2\n-imgdl unsplash abc123\n-imgdl https://images.unsplash.com/...'); return; }
  let img = null;
  try {
    if (/^https?:\/\//i.test(ref)) {
      img = { imageUrl: ref, downloadUrl: ref, title: 'direct URL', source: 'direct', sourceKey: 'direct', license: 'Unknown', licenseUnknown: true };
    } else if (/^\d+$/.test(ref.split(' ')[0]) && ref.split(' ').length === 1) {
      const f = findInSession(ctx, ref);
      if (f.error) { await ctx.reply(f.error); return; }
      img = f.img;
    } else {
      const [sourceId, imgId] = ref.split(/\s+/);
      img = await engine.getImage(imgId, sourceId);
    }
    await ctx.reply(`⬇️ Downloading "${img.title || img.imageUrl}"…\nLicense: ${licenseLine(img)}`);
    const dl = await engine.downloadImage(img, {});
    const sock = ctx.line && ctx.line.sock;
    const caption = `🖼️ ${img.title || 'image'}\n📜 ${licenseLine(img)}\n✍️ ${attributionText(img)}${dl.licenseWarning ? `\n⚠️ ${dl.licenseWarning}` : ''}`;
    if (sock) {
      const isImg = dl.mime.startsWith('image/') && dl.mime !== 'image/svg+xml';
      await sock.sendMessage(ctx.chatJid,
        isImg ? { image: { url: dl.path }, caption } : { document: { url: dl.path }, fileName: `image${dl.mime === 'image/svg+xml' ? '.svg' : '.img'}`, mimetype: dl.mime, caption },
        { quoted: ctx.msg });
    } else {
      await ctx.reply(`Saved to ${dl.path} (${dl.bytes} bytes, ${dl.mime})`);
    }
    engine.cleanupTemp(dl.path);
  } catch (e) {
    await ctx.reply(`Download failed: ${String((e && e.message) || e).slice(0, 300)}`);
  }
}

async function cmdImageStatus(ctx) {
  const all = registry.all();
  const sum = engine.healthSummary();
  const byId = new Map(sum.sources.map((s) => [s.id, s]));
  const icon = (st) => st === 'healthy' ? '✅' : st === 'unknown' ? '⚪' : st === 'auth_required' ? '🔑' : st === 'inactive' ? '⛔' : '⚠️';
  const lines = ['🖼️ IMAGE SOURCES (100)', ''];
  for (const s of all) {
    const h = byId.get(s.id);
    lines.push(`${icon(h.status)} ${s.name}${s.endpointVerified ? '' : ' (unverified endpoint)'}${s.requiresKey && !process.env[s.envKey] ? ' — key missing' : ''}`);
  }
  const counts = sum.byStatus;
  lines.push('', `Healthy: ${counts.healthy || 0} · Degraded: ${counts.degraded || 0} · Failed: ${(counts.timeout || 0) + (counts.inactive || 0)} · Auth needed: ${counts.auth_required || 0} · Unchecked: ${counts.unknown || 0}`);
  await ctx.reply(lines.join('\n'));
}

async function cmdImageSource(ctx, args) {
  if (ctx.isOwner === false) { await ctx.reply('Owner only.'); return; }
  const [action, target] = args;
  const all = registry.all();
  if (!action || action === 'list') {
    await ctx.reply('Sources:\n' + all.map((s) => `• ${s.id} — ${s.name} [${s.transport}] ${s.enabled ? 'on' : 'off'}${s.endpointVerified ? '' : ' (unverified)'}`).join('\n'));
    return;
  }
  if (action === 'status') { await cmdImageStatus(ctx); return; }
  const src = all.find((s) => s.id === (target || '').toLowerCase());
  if (!src && action !== 'test') { await ctx.reply(`Unknown source: ${target}\nUse: -imagesource enable|disable|test <id> | list | status`); return; }
  if (action === 'enable' || action === 'disable') {
    src._adapter.enabled = action === 'enable';
    src.enabled = src._adapter.enabled;
    await ctx.reply(`${src.name}: ${action}d`);
    return;
  }
  if (action === 'test') {
    const id = (target || '').toLowerCase();
    const s = all.find((x) => x.id === id);
    if (!s) { await ctx.reply(`Unknown source: ${target}`); return; }
    await ctx.reply(`🧪 Testing ${s.name}…`);
    const w = new BaseImageSource(s._adapter, { env: (k) => process.env[k], health: engine.health });
    const r = await w.healthCheck();
    await ctx.reply(r.ok
      ? `✅ ${s.name}: OK (${r.results} result, ${r.latencyMs}ms)`
      : `❌ ${s.name}: ${r.error}`);
    return;
  }
  await ctx.reply('Use: -imagesource enable|disable|test <id> | list | status');
}

async function cmdNextPrev(ctx, dir) {
  const sess = sessions.get(ctx.chatJid);
  if (!sess) { await ctx.reply('No active search. Run -image <query> first.'); return; }
  const pages = Math.max(1, Math.ceil(sess.results.length / PAGE_SIZE));
  sess.page = (sess.page + dir + pages) % pages;
  sess.ts = Date.now();
  await ctx.reply(fmtPage(sess));
}

// ---- command table ----
const SEARCH_COMMANDS = {
  image: 'image', img: 'image', photo: 'image', photos: 'image', picture: 'image', pic: 'image',
  freeimage: 'freeimage',
  wallpaper: 'wallpaper',
  illustration: 'illustration',
  vector: 'vector',
  icon: 'icon',
  publicdomain: 'publicdomain', pd: 'publicdomain',
  ccimage: 'ccimage', cc0: 'ccimage',
  openimage: 'openimage',
  imageall: 'imageall',
};

const commands = {};
for (const [cmd, engineCmd] of Object.entries(SEARCH_COMMANDS)) {
  commands[cmd] = (ctx, args) => runSearch(ctx, args, engineCmd);
}
commands.bestimage = (ctx, args) => runSearch(ctx, args, 'image', { maxResults: 1 });
commands.commercialimage = (ctx, args) => runSearch(ctx, [...args, '--commercial'], 'image');
commands.imgurl = (ctx, args) => runSearch(ctx, args, 'image', { urlsOnly: true });
commands.imagecompare = (ctx, args) => runSearch(ctx, args, 'imagecompare', { groupBySource: true });
commands.imagedetail = cmdImageDetail;
commands.imgdl = cmdImgDl;
commands.downloadimage = cmdImgDl;
commands.imagestatus = cmdImageStatus;
commands.imagesource = cmdImageSource;
commands.next = (ctx) => cmdNextPrev(ctx, 1);
commands.prev = (ctx) => cmdNextPrev(ctx, -1);
commands.imagehelp = async (ctx) => {
  await ctx.reply([
    '🖼️ IMAGE COMMANDS', '',
    '-image <q> [--limit N --landscape --portrait --4k --commercial --cc0 --public-domain --no-attribution]',
    '-img -photo -photos -picture -pic — aliases',
    '-wallpaper <q>   -illustration <q>   -vector <q>   -icon <q>',
    '-freeimage <q>   -publicdomain <q> (-pd)   -ccimage <q> (-cc0)   -openimage <q>',
    '-imageall <q> — search all relevant sources sequentially',
    '-bestimage <q> — single top-ranked result',
    '-commercialimage <q> — commercial-use only',
    '-imgurl <q> — direct image URLs only',
    '-imagecompare <q> — results grouped by source',
    '-imagedetail <n|source:id> — full metadata + license',
    '-imgdl <n|source id|url> — download on demand (license-checked)',
    '-imagestatus — 100-source health table',
    '-imagesource enable|disable|test <id> — owner only',
    '-next / -prev — paginate last search',
  ].join('\n'));
};

async function handleTextCommand(cmd, ctxLike, args) {
  const fn = commands[cmd];
  if (!fn) return false;
  await fn(ctxLike, args);
  return true;
}

module.exports = {
  name: 'image-intelligence',
  description: '100-source image search with license metadata, ranking, dedup and download-on-demand.',
  commands,
  // fallback for {sock,msg,args,text,sender,isOwner,reply}-style bots
  execute: async ({ sock, msg, args, text, sender, isOwner, reply }) => {
    const t = String(text || '').replace(/^-/, '').trim();
    const [cmd, ...rest] = t.split(/\s+/);
    const done = await handleTextCommand((cmd || '').toLowerCase(), {
      reply, sock, line: { sock }, msg,
      chatJid: (msg && msg.key && msg.key.remoteJid) || sender,
      senderJid: sender, isOwner,
    }, rest.length ? rest : (args || []));
    if (!done) await reply('Unknown image command. Try -imagehelp');
  },
  handleTextCommand,
};
