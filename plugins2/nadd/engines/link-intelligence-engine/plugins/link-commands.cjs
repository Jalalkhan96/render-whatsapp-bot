'use strict';
// Link Intelligence Engine — WhatsApp bot plugin (CommonJS, `-` prefix).
// Drop into your Baileys bot's plugins/ folder: require()s ../link-engine via ENGINE_PATH.
const path = require('path');
const ENGINE_PATH = process.env.LINK_ENGINE_PATH || path.join(__dirname, '..');

const LM = require(path.join(ENGINE_PATH, 'link-manager.js'));
const { formatTrace } = require(path.join(ENGINE_PATH, 'redirect-tracer.js'));
const { normalizeUrl } = require(path.join(ENGINE_PATH, 'url-normalizer.js'));
const health = require(path.join(ENGINE_PATH, 'health-manager.js'));

const tick = (b) => (b ? '✅' : '❌');

function fmtExpand(r) {
  const chainHosts = r.redirects.filter((h) => h.type !== 'final').map((h) => {
    try { return new URL(h.url).hostname; } catch (_) { return h.url; }
  });
  const uniq = [...new Set(chainHosts)];
  return [
    '🔗 LINK EXPANSION', '',
    `Provider: ${r.provider.name}`, '',
    `Input: ${r.inputUrl}`, '',
    `Final: ${r.finalDestination.url}`, '',
    `Redirects: ${r.redirects.length ? r.redirects.length - 1 : 0}`,
    `Chain: ${uniq.join(' → ') || '(direct)'}`, '',
    `HTTPS: ${tick(r.finalDestination.scheme === 'https')}`, '',
    `Tracking: ${r.tracking.detected ? r.tracking.parameters.length + ' parameter(s): ' + r.tracking.parameters.join(', ') : 'none'}`,
    `Affiliate: ${r.affiliate.detected ? r.affiliate.parameters.join(', ') : 'none'}`, '',
    `Risk: ${r.security.risk}${r.security.signals.length ? ' (' + r.security.signals.join(', ') + ')' : ''}`, '',
    `Status: ${r.status === 'resolved' ? '✅ Resolved' : r.status}`,
    ...(r.status === 'INTERACTION_REQUIRED' ? ['', `⚠️ Manual click required: ${r.interstitialPage || ''}`, `Advertised destination: ${r.advertisedDestination || 'unknown'}`] : []),
  ].join('\n');
}

async function needUrl(ctx, args) {
  if (!args[0]) { await ctx.reply('Usage:\n-' + ctx.cmd + ' <url>'); return null; }
  return args[0];
}

// ---------- commands ----------
async function cmdShort(ctx, args) {
  // -short [provider] <url>
  let provider = null, url = args[0];
  if (args.length >= 2) { provider = args[0].toLowerCase(); url = args[1]; }
  if (!url) { await ctx.reply('Usage:\n-short <url>\n-short <provider> <url>\nProviders: bitly, tinyurl, cuttly, tly, rebrandly, isgd …'); return; }
  await ctx.reply('Shortening…');
  const r = provider ? await LM.shortenWith(url, provider) : await LM.autoShorten(url);
  if (r.ok) await ctx.reply(`🔗 SHORT URL\n\nProvider: ${r.provider}\n\nShort: ${r.shortUrl}`);
  else await ctx.reply(`❌ Shorten failed: ${r.status}${r.detail ? '\n' + r.detail : ''}\nTried free no-key providers (is.gd, v.gd, da.gd, clck.ru, cleanuri, tinyurl). Key-based providers need API keys in .env.`);
}

async function cmdAutoShort(ctx, args) {
  const url = await needUrl(ctx, args); if (!url) return;
  await ctx.reply('Auto-selecting provider…');
  const r = await LM.autoShorten(url);
  await ctx.reply(r.ok ? `🔗 SHORT URL\n\nProvider: ${r.provider}\n\nShort: ${r.shortUrl}` : `❌ ${r.status}`);
}

async function cmdExpand(ctx, args) {
  const url = await needUrl(ctx, args); if (!url) return;
  await ctx.reply('Expanding…');
  const r = await LM.analyzeUrl(url);
  LM.logHistory(r);
  await ctx.reply(fmtExpand(r));
}

async function cmdTrace(ctx, args) {
  const url = await needUrl(ctx, args); if (!url) return;
  await ctx.reply('Tracing redirects…');
  const r = await LM.analyzeUrl(url);
  await ctx.reply(formatTrace({ hops: r.redirects.map((h) => ({ hostname: (() => { try { return new URL(h.url).hostname; } catch (_) { return h.url; } })(), statusCode: h.statusCode, type: h.type })), hopCount: r.redirects.length, status: r.status }));
}

async function cmdCheck(ctx, args) {
  const url = await needUrl(ctx, args); if (!url) return;
  await ctx.reply('Checking link…');
  const r = await LM.analyzeUrl(url);
  LM.logHistory(r);
  await ctx.reply([
    '🔗 LINK CHECK', '',
    `Input: ${r.inputUrl}`,
    `Provider: ${r.provider.name}`,
    `Destination: ${r.finalDestination.url}`, '',
    `Redirects: ${r.redirects.length ? r.redirects.length - 1 : 0}`,
    `HTTPS: ${tick(r.finalDestination.scheme === 'https')}`,
    `Tracking: ${tick(r.tracking.detected)}${r.tracking.detected ? ' (' + r.tracking.parameters.join(', ') + ')' : ''}`,
    `Affiliate: ${tick(r.affiliate.detected)}`, '',
    `Risk: ${r.security.risk}`,
    `Signals: ${r.security.signals.join(', ') || 'none'}`, '',
    `Status: ${r.status}`,
  ].join('\n'));
}

async function cmdPreview(ctx, args) {
  const url = await needUrl(ctx, args); if (!url) return;
  await ctx.reply('Fetching preview…');
  const r = await LM.linkPreview(url);
  const p = r.preview || {};
  await ctx.reply(['🔗 LINK PREVIEW', '', `Final domain: ${r.finalDestination.domain}`, `Title: ${p.title || '—'}`, `Description: ${(p.description || '—').slice(0, 200)}`, `Image: ${p.image || '—'}`, `HTTP: ${r.status}`].join('\n'));
}

async function cmdClean(ctx, args) {
  const url = await needUrl(ctx, args); if (!url) return;
  const { clean } = LM.cleanLink(url);
  const before = (() => { try { return new URL(normalizeUrl(url)).searchParams.size; } catch (_) { return '?'; } })();
  const after = (() => { try { return new URL(clean).searchParams.size; } catch (_) { return '?'; } })();
  await ctx.reply(['🧹 CLEAN LINK', '', `Original: ${url}`, '', `Cleaned: ${clean}`, '', `Parameters: ${before} → ${after} (tracking/affiliate removed, functional kept)`].join('\n'));
}

async function cmdInfo(ctx, args) {
  const url = await needUrl(ctx, args); if (!url) return;
  const r = await LM.analyzeUrl(url);
  await ctx.reply(['ℹ️ LINK INFO', '', `Classification: ${r.classification.join(' + ')}`, `Provider: ${r.provider.name} (confidence ${r.provider.confidence})`, `Domain: ${r.finalDestination.domain}`, `Host: ${r.finalDestination.hostname}`, `Scheme: ${r.finalDestination.scheme}`, `Monetized: ${r.monetized.type}`, `Status: ${r.status}`].join('\n'));
}

async function cmdCompare(ctx, args) {
  if (args.length < 2) { await ctx.reply('Usage:\n-comparelink <url1> <url2>'); return; }
  await ctx.reply('Comparing…');
  const [a, b] = await Promise.all([LM.analyzeUrl(args[0]), LM.analyzeUrl(args[1])]);
  const same = a.finalDestination.url === b.finalDestination.url;
  await ctx.reply(['⚖️ LINK COMPARISON', '', `Same destination: ${tick(same)}`, `A → ${a.finalDestination.url}`, `B → ${b.finalDestination.url}`, '', `Redirects: A=${a.redirects.length} B=${b.redirects.length}`, `Tracking: A=[${a.tracking.parameters.join(',')}] B=[${b.tracking.parameters.join(',')}]`, `Domains: ${a.finalDestination.domain} vs ${b.finalDestination.domain}`].join('\n'));
}

async function cmdBulk(ctx, args) {
  const urls = args.slice(0, 20);
  if (!urls.length) { await ctx.reply('Usage:\n-expandbulk <url1> <url2> … (max 20)'); return; }
  await ctx.reply(`Expanding ${urls.length} URLs one by one…`);
  const lines = [];
  for (let i = 0; i < urls.length; i++) {
    let tag;
    try {
      const r = await LM.analyzeUrl(urls[i]);
      tag = r.status === 'resolved' ? 'SUCCESS' : r.status;
      lines.push(`${i + 1}/${urls.length} ${tag} → ${r.finalDestination.url}`);
    } catch (e) { lines.push(`${i + 1}/${urls.length} ERROR → ${e.message}`); }
  }
  await ctx.reply('📦 BULK EXPANSION\n\n' + lines.join('\n'));
}

async function cmdStatus(ctx) {
  const rows = LM.providers.slice(0, 40).map((p) => {
    const h = health.get(p.id);
    const icon = h.status === 'healthy' ? '✅' : h.status === 'unknown' ? '⚪' : h.status === 'authentication_required' ? '🔑' : '⚠️';
    return `${p.name.padEnd(14)} ${icon} ${p.type}`;
  });
  await ctx.reply('LINK PROVIDERS\n\n' + rows.join('\n'));
}

async function cmdHealth(ctx) {
  const all = health.all();
  const ids = Object.keys(all);
  await ctx.reply(ids.length ? 'LINK HEALTH\n\n' + ids.map((id) => `${id}: ${all[id].status} (avg ${all[id].averageLatency || 0}ms, errors ${all[id].errorCount})`).join('\n')
    : 'No health data yet. Run -linkcheck first, or set DAILY health cron.');
}

async function cmdHistory(ctx) {
  const h = LM.getHistory().slice(0, 10);
  await ctx.reply(h.length ? '🕘 LINK HISTORY\n\n' + h.map((e, i) => `${i + 1}. ${e.input} → ${e.finalHost} [${e.status}] ${e.at}`).join('\n') : 'No history yet.');
}

async function cmdSearch(ctx, args) {
  const q = (args[0] || '').toLowerCase();
  const hits = LM.providers.filter((p) => !q || p.name.toLowerCase().includes(q) || p.type.includes(q) || p.id.includes(q));
  await ctx.reply(hits.length ? '🔍 PROVIDERS\n\n' + hits.map((p) => `• ${p.name} (${p.id}) — ${p.type}${p.homepage ? '\n  ' + p.homepage : ''}`).join('\n') : 'No providers match.');
}

async function cmdQr(ctx, args) {
  const url = await needUrl(ctx, args); if (!url) return;
  try {
    const QR = require('qrcode');
    const buf = await QR.toBuffer(url, { width: 512 });
    await ctx.line.sock.sendMessage(ctx.chatJid, { image: buf, caption: `QR for ${url}` }, { quoted: ctx.msg });
  } catch (_) {
    await ctx.reply('QR needs the optional npm package "qrcode" (npm i qrcode). URL: ' + url);
  }
}

module.exports = {
  commands: {
    short: cmdShort,
    autoshort: cmdAutoShort,
    expand: cmdExpand,
    unshort: cmdExpand,
    redirecttrace: cmdTrace,
    linkcheck: cmdCheck,
    linkpreview: cmdPreview,
    cleanlink: cmdClean,
    linkinfo: cmdInfo,
    comparelink: cmdCompare,
    expandbulk: cmdBulk,
    linkstatus: cmdStatus,
    linkhealth: cmdHealth,
    linkhistory: cmdHistory,
    linksearch: cmdSearch,
    qr: cmdQr,
  },
  help: () => [
    '🔗 LINK ENGINE',
    '-short [provider] <url> — shorten',
    '-autoshort <url> — auto-pick provider',
    '-expand <url> — expand + full intel',
    '-redirecttrace <url> — hop-by-hop chain',
    '-linkcheck <url> — status/TLS/tracking/risk',
    '-linkpreview <url> — title/desc/image',
    '-cleanlink <url> — strip tracking params',
    '-linkinfo <url> — classification + provider',
    '-comparelink <u1> <u2> — same destination?',
    '-expandbulk <urls…> — up to 20, sequential',
    '-linkstatus / -linkhealth / -linkhistory',
    '-linksearch <query> — find providers',
    '-qr <url> — QR code (needs npm qrcode)',
  ].join('\n'),
};
