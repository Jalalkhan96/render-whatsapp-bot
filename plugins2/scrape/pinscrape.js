'use strict';

const pinterest = require('../../lib/pinterestSearchService.cjs');
const { getJid, getPrefix, safeText, clampCount, isUrl } = require('./engines/shared.cjs');

function usage(prefix) {
  return [
    '╭━━━〔 📌 *PINTEREST SCRAPER* 〕━━━╮',
    '┃',
    `┃ ${prefix}pinscrape <query>`,
    `┃ ${prefix}pinscrape <count> <query>`,
    `┃ ${prefix}pinscrape image <query>`,
    `┃ ${prefix}pinscrape video <query>`,
    `┃ ${prefix}pinscrape <public Pinterest URL>`,
    '┃',
    '┃ Direct public HTML + XHR/browser extraction first.',
    '┃ Apify token-pool backup tops up text searches.',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  ].join('\n');
}

module.exports = {
  command: 'pinscrape',
  aliases: ['pinsscrape', 'pinterest-scrape', 'pinscraper'],
  category: 'scrape',
  description: 'Scrape public Pinterest images and videos, with Apify fallback',
  permission: 'PUBLIC/DEFAULT',

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
      const result = await pinterest.search(input, { limit: count, mediaType, apifyFallback: true, scrolls: 3 });
      const items = (result.items || []).slice(0, count);
      let sent = 0;
      for (const item of items) {
        try {
          await pinterest.sendPinterestMedia(sock, jid, item);
          sent += 1;
        } catch (error) {
          console.warn('[SCRAPE/PINTEREST] media send failed:', error?.message || error);
        }
      }
      await sock.sendMessage(jid, { react: { text: sent ? '✅' : '❌', key: message.key } }).catch(() => {});
      if (!sent) {
        return safeText(sock, message, context, `❌ Pinterest results could not be sent. Try ${prefix}pinapify ${input} or a smaller result count.`);
      }
      console.log(`[SCRAPE/PINTEREST] sent ${sent}/${items.length} media items via ${result.provider}`);
      return undefined;
    } catch (error) {
      console.error('[SCRAPE/PINTEREST] scrape failed:', error?.message || error);
      await sock.sendMessage(jid, { react: { text: '❌', key: message.key } }).catch(() => {});
      const help = isUrl(input) ? 'Check that the Pinterest URL is public and accessible.' : `Try ${prefix}pinapify ${input} to use Apify only.`;
      return safeText(sock, message, context, `❌ Pinterest scrape failed: ${String(error?.message || 'unknown error').slice(0, 220)}\n${help}`);
    }
  },
};
