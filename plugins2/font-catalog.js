'use strict';

/** Source-specific and catalog commands; all font results are sent as documents. */
const db = require('../lib/fontCatalogDb');
const fontPlugin = require('../plugins/font-downloader');

function reply(sock, m, c, text) {
  const jid = c?.chatId || m?.key?.remoteJid;
  if (!jid) return Promise.resolve();
  return sock.sendMessage(jid, { text: String(text).slice(0, 6500) }, { quoted: m });
}
function safe(v, fallback = 'N/A', max = 150) { return db.clean(v, fallback).replace(/[*_~`]/g, '').slice(0, max); }
async function outputResults(sock, m, a, c, options = {}) {
  const prefix = c?.prefix || '-';
  let args = Array.isArray(a) ? [...a] : [];
  let page = 1;
  if (String(args[0] || '').toLowerCase() === 'page') {
    page = Number.parseInt(args[1], 10);
    args = args.slice(2);
    if (!Number.isInteger(page) || page < 1) return reply(sock, m, c, `Usage: ${prefix}${options.source?.shortCommand || options.source?.command || 'fontdb'} page <number> <query>`);
  }
  if (['search', 'find'].includes(String(args[0] || '').toLowerCase())) args = args.slice(1);
  const query = db.clean(args.join(' '));
  if (!query) return reply(sock, m, c, `Usage: ${prefix}${options.source?.shortCommand || options.source?.command || 'fontdb'} <font name>`);
  try {
    const result = await db.queryFonts({ query, source: options.source, downloadableOnly: true, limit: 10, offset: (page - 1) * 10 });
    if (!result.rows.length) return reply(sock, m, c, `🔎 No downloadable fonts found for *${safe(query, '', 100)}*${options.source ? ` on ${options.source.label}` : ' across the catalog'}. Try a shorter search or use ${prefix}fontwebsearch <name>.`);
    const heading = options.source ? `${options.source.label.toUpperCase()} FONT SEARCH` : 'COMBINED FONT SEARCH';
    const pages = Math.max(1, Math.ceil(result.total / result.limit));
    return fontPlugin.deliverFontRows(sock, m, c, result.rows, {
      title: `${heading}: ${query} · page ${page}/${pages}`,
      maxFiles: 10,
    });
  } catch (error) { return reply(sock, m, c, db.errorMessage(error)); }
}
async function downloadById(sock, m, a, c) {
  const id = Number.parseInt(String(a?.[0] || ''), 10);
  if (!Number.isSafeInteger(id) || id < 1) return reply(sock, m, c, `Usage: ${(c?.prefix || '-')}fontget <database-id>`);
  try {
    const row = await db.getFontById(id);
    if (!row) return reply(sock, m, c, `❌ No font found with database ID ${id}.`);
    if (!db.safeUrl(row.download_url)) return reply(sock, m, c, `❌ Font ID ${id} has no saved download URL. Try ${(c?.prefix || '-')}fontwebsearch ${safe(row.name, '', 80)}.`);
    return fontPlugin.deliverFontRows(sock, m, c, [row], { title: `FONT ID ${id}: ${row.name}`, maxFiles: 1 });
  } catch (error) { return reply(sock, m, c, db.errorMessage(error)); }
}
async function showStats(sock, m, a, c) {
  try {
    const stats = await db.getStats();
    const grouped = stats.sources.map(s => `• ${safe(s.source, '', 60)}: ${s.total.toLocaleString()} (${s.downloadable.toLocaleString()} with saved download URL)`);
    return reply(sock, m, c, `📊 *FONT DATABASE STATS*\n\nTotal fonts: *${stats.total.toLocaleString()}*\nSaved download URLs: *${stats.downloadable.toLocaleString()}*\nMissing URLs: *${Math.max(0, stats.total - stats.downloadable).toLocaleString()}*\n\n${grouped.join('\n')}`);
  } catch (error) { return reply(sock, m, c, db.errorMessage(error)); }
}
function sitesText(prefix) {
  return `╭━━━〔 🌐 FONT COLLECTIONS 〕━━━╮\n${db.SOURCES.map(s => `┃ ${s.label}: ${prefix}${s.shortCommand || s.command} <query>`).join('\n')}\n┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n┃ All sources: ${prefix}font <query>\n┃ Catalog: ${prefix}fontdb <query>\n┃ Live scrape: ${prefix}fontwebsearch <query>\n┃ Stats: ${prefix}fontstats\n┃ Download by ID: ${prefix}fontget <id>\n┃ Legacy *db command names still work.*\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
}
async function combined(sock, m, a = [], c = {}) {
  const action = String(a[0] || '').toLowerCase();
  const prefix = c?.prefix || '-';
  if (!action || ['help', 'menu'].includes(action)) return reply(sock, m, c, `╭━━━〔 ✦ FONT CATALOG 〕━━━╮\n┃ ${prefix}font <name> — search + send files\n┃ ${prefix}font random — send 10 random files\n┃ ${prefix}fontdb page 2 <name> — next results\n┃ ${prefix}font source <site> <name> — filter\n┃ ${prefix}font sites — source commands\n┃ ${prefix}font stats — database totals\n┃ ${prefix}fontget <id> — send one file\n┃ ${prefix}fontwebsearch <name> — live scrape\n╰━━━━━━━━━━━━━━━━━━━━━━━━╯\nNine collections · direct Turso access · no URL-only font results.`);
  if (['sites', 'sources', 'websites'].includes(action)) return reply(sock, m, c, sitesText(prefix));
  if (['stats', 'count', 'counts'].includes(action)) return showStats(sock, m, a, c);
  if (['get', 'download', 'dl'].includes(action)) return downloadById(sock, m, [a[1]], c);
  if (action === 'source' || action === 'site') {
    const source = db.sourceByName(a[1]);
    if (!source) return reply(sock, m, c, `Unknown source. Use ${prefix}fontsites to see source names.`);
    return outputResults(sock, m, a.slice(2), c, { source });
  }
  if (action === 'random') {
    try {
      const option = db.clean(a.slice(1).join(' '));
      const source = db.sourceByName(option);
      const result = await db.queryFonts({ source: source || undefined, random: true, downloadableOnly: true, limit: 10 });
      if (!result.rows.length) return reply(sock, m, c, 'No downloadable font records found. Check the database download_url values.');
      return fontPlugin.deliverFontRows(sock, m, c, result.rows, { title: `RANDOM FONT FILES${source ? ` · ${source.label}` : ''}`, maxFiles: 10 });
    } catch (error) { return reply(sock, m, c, db.errorMessage(error)); }
  }
  return outputResults(sock, m, a, c);
}

module.exports = [
  { command: 'fontdb', aliases: ['fontcatalog', 'fontsearchdb'], category: 'utility', description: 'Search Turso and send matching saved font files', usage: '-fontdb <name> | -fontdb source <site> <name> | -fontdb stats', handler: combined },
  { command: 'fontsource', aliases: ['fontsrc'], category: 'utility', description: 'Search one font source and send saved files', usage: '-fontsource <site> <name>', async handler(sock, m, a = [], c = {}) { const source = db.sourceByName(a[0]); if (!source) return reply(sock, m, c, `Usage: ${(c?.prefix || '-')}fontsource <site> <name>`); return outputResults(sock, m, a.slice(1), c, { source }); } },
  { command: 'fontsites', aliases: ['fontwebsites', 'fontdbsites'], category: 'utility', description: 'List font database sources', usage: '-fontsites', async handler(sock, m, a, c = {}) { return reply(sock, m, c, sitesText(c?.prefix || '-')); } },
  { command: 'fontstats', aliases: ['fontdbstats', 'fontcatalogstats'], category: 'utility', description: 'Show font counts and download URL coverage by source', usage: '-fontstats', handler: showStats },
  { command: 'fontget', aliases: ['fontdownloadlink', 'fonturl'], category: 'utility', description: 'Download a saved font file by database ID', usage: '-fontget <id>', handler: downloadById },
  ...db.SOURCES.flatMap(source => {
    const handler = (sock, m, a = [], c = {}) => outputResults(sock, m, a, c, { source });
    const modern = source.shortCommand && source.shortCommand !== source.command
      ? [{ command: source.shortCommand, aliases: [], category: 'utility', description: `Search ${source.label} and send font files`, usage: `-${source.shortCommand} <query>`, handler }]
      : [];
    const legacy = [{ command: source.command, aliases: [], category: 'utility', description: `Legacy search command for ${source.label} font files`, usage: `-${source.command} <query>`, handler }];
    return [...modern, ...legacy];
  }),
];
