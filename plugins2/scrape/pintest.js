'use strict';

const pinterest = require('../../lib/pinterestSearchService.cjs');
const direct = require('./engines/pinterest/index.cjs');
const { resolveWithFallback } = require('../pindl');
const { getJid, getPrefix, safeText, clampCount, isUrl } = require('./engines/shared.cjs');

function extractPinsFromHtml(html, limit = 10) {
  return direct.extractMediaFromHtml(html, limit)
    .filter((item) => item.type === 'image')
    .map((item) => ({ image_url: item.url, description: item.description || 'Public Pin Asset', source: item.source || 'direct_public_scrape' }));
}

function usage(prefix) {
  return [
    '╭━━━〔 📌 *PINTEREST TEST SCRAPER* 〕━━━╮',
    '┃',
    `┃ ${prefix}pintest <query>`,
    `┃ ${prefix}pintest <count> <query>`,
    `┃ ${prefix}pintest video <query>`,
    `┃ ${prefix}pintest image <query>`,
    `┃ ${prefix}pintest <public Pinterest URL>`,
    '┃',
    '┃ Direct public-page + browser/XHR extraction first.',
    '┃ Apify token-pool backup fills missing query results.',
    '┃ Sends verified images/videos with no captions.',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  ].join('\n');
}

async function pageUrlFallback(input) {
  if (!isUrl(input) || !pinterest.isPinterestPage(input)) return [];
  try {
    const info = await resolveWithFallback(input);
    const items = [];
    for (const url of info.videos || []) items.push({ type: 'video', url, title: info.title || '' });
    for (const url of info.images || []) items.push({ type: 'image', url, title: info.title || '' });
    return items;
  } catch { return []; }
}

module.exports = {
  command: 'pintest',
  aliases: ['pintestscrape', 'pintestsearch', 'pinteresttest'],
  category: 'scrape',
  description: 'Test the direct Pinterest image/video scraper with Apify fallback',
  permission: 'PUBLIC/DEFAULT',
  extractPinsFromHtml,

  async handler(sock, message, args = [], context = {}) {
    const jid = getJid(message, context);
    if (!jid) return;
    const prefix = getPrefix(context);
    if (!args.length || ['menu', 'help'].includes(String(args[0]).toLowerCase())) {
      return safeText(sock, message, context, usage(prefix));
    }

    let mediaType = 'all';
    const inputArgs = args.slice();
    if (['image', 'video'].includes(String(inputArgs[0] || '').toLowerCase())) mediaType = inputArgs.shift().toLowerCase();
    let count = 5;
    if (/^\d+$/.test(String(inputArgs[0] || ''))) count = clampCount(inputArgs.shift(), 5, 10);
    const input = inputArgs.join(' ').trim();
    if (!input) return safeText(sock, message, context, usage(prefix));

    await sock.sendMessage(jid, { react: { text: '🔎', key: message.key } }).catch(() => {});
    try {
      let result;
      let items = [];
      try {
        result = await pinterest.search(input, { limit: count, mediaType, apifyFallback: true, scrolls: 3 });
        items = result.items || [];
      } catch (error) {
        if (!isUrl(input)) throw error;
        items = await pageUrlFallback(input);
        if (!items.length) throw error;
      }

      if (mediaType !== 'all') items = items.filter((item) => item.type === mediaType);
      let sent = 0;
      for (const item of items.slice(0, count)) {
        try {
          await pinterest.sendPinterestMedia(sock, jid, item);
          sent += 1;
        } catch (error) {
          console.warn('[SCRAPE/PINTEST] media send failed:', error?.message || error);
        }
      }
      await sock.sendMessage(jid, { react: { text: sent ? '✅' : '❌', key: message.key } }).catch(() => {});
      if (!sent) return safeText(sock, message, context, `❌ Pinterest found results, but no media could be sent. Try ${prefix}pinapify ${input} or another query.`);
      console.log(`[SCRAPE/PINTEST] sent ${sent}/${items.length} items via ${result?.provider || 'pin URL resolver'}`);
      return undefined;
    } catch (error) {
      console.error('[SCRAPE/PINTEST] scrape failed:', error?.message || error);
      await sock.sendMessage(jid, { react: { text: '❌', key: message.key } }).catch(() => {});
      return safeText(sock, message, context, `❌ Pinterest test scrape failed: ${String(error?.message || 'unknown error').slice(0, 280)}`);
    }
  },
};
