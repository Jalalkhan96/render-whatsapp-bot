'use strict';

const path = require('path');
const { searchMemes } = require('./engines/meme-search-engine/src/index.cjs');
const { getJid, getInputText, getPrefix, safeText, sendImage, clampCount } = require('./engines/shared.cjs');

function usage(prefix) {
  return [
    '╭━━━〔 🧩 *MEME SCRAPE* 〕━━━╮',
    '┃',
    `┃ ${prefix}scrapememe <query>`,
    `┃ ${prefix}scrapememe <count> <query>`,
    '┃',
    '┃ Key-free public-source search.',
    '┃ Sources: Imgflip, meme-api,',
    '┃ Wikimedia Commons.',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  ].join('\n');
}

module.exports = {
  command: 'scrapememe',
  aliases: ['scrapememes', 'msearch'],
  category: 'scrape',
  description: 'Search key-free public meme sources and send results',
  permission: 'PUBLIC/DEFAULT',

  async handler(sock, message, args = [], context = {}) {
    const jid = getJid(message, context);
    if (!jid) return;
    const prefix = getPrefix(context);
    if (!args.length || ['menu', 'help'].includes(String(args[0]).toLowerCase())) {
      return safeText(sock, message, context, usage(prefix));
    }

    let count = 5;
    let queryArgs = args.slice();
    if (/^\d+$/.test(String(args[0]))) {
      count = clampCount(args[0], 5, 8);
      queryArgs = args.slice(1);
    }
    const query = queryArgs.join(' ').trim();
    if (!query) return safeText(sock, message, context, usage(prefix));

    try {
      const results = await searchMemes(query, {
        limit: count,
        nsfw: false,
        cwd: path.join(process.cwd(), 'data', 'scrape-cache'),
      });
      if (!results.length) return safeText(sock, message, context, `❌ No meme results found for: ${query}`);

      let sent = 0;
      for (const item of results.slice(0, count)) {
        if (!item.imageUrl) continue;
        try {
          await sendImage(sock, message, context, item.imageUrl);
          sent++;
        } catch (err) {
          console.warn('[SCRAPE/MEME] media send failed:', err.message);
        }
      }
      if (!sent) {
        const links = results.slice(0, count).map((r, i) => `${i + 1}. ${r.title}\n${r.imageUrl || r.pageUrl}`).join('\n\n');
        return safeText(sock, message, context, `🧩 Meme results\n\n${links}`);
      }
      return undefined;
    } catch (err) {
      console.error('[SCRAPE/MEME] search failed:', err);
      return safeText(sock, message, context, `❌ Meme scrape failed: ${err.message}`);
    }
  },
};
