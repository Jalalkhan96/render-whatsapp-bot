'use strict';

const path = require('path');
const { searchSounds } = require('./engines/sound-meme-engine/src/index.cjs');
const { getJid, getInputText, getPrefix, safeText, sendAudio, clampCount } = require('./engines/shared.cjs');

function usage(prefix) {
  return [
    '╭━━━〔 🔊 *SOUND SCRAPE* 〕━━━╮',
    '┃',
    `┃ ${prefix}scrapesound <query>`,
    `┃ ${prefix}scrapesound <count> <query>`,
    '┃',
    '┃ Key-free sound search.',
    '┃ Wikimedia audio = downloadable.',
    '┃ YouTube = official links only.',
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  ].join('\n');
}

module.exports = {
  command: 'scrapesound',
  aliases: ['scrapesounds', 'soundsearch2'],
  category: 'scrape',
  description: 'Search key-free public sound sources and send audio results',
  permission: 'PUBLIC/DEFAULT',

  async handler(sock, message, args = [], context = {}) {
    const jid = getJid(message, context);
    if (!jid) return;
    const prefix = getPrefix(context);
    if (!args.length || ['menu', 'help'].includes(String(args[0]).toLowerCase())) {
      return safeText(sock, message, context, usage(prefix));
    }

    let count = 3;
    let queryArgs = args.slice();
    if (/^\d+$/.test(String(args[0]))) {
      count = clampCount(args[0], 3, 6);
      queryArgs = args.slice(1);
    }
    const query = queryArgs.join(' ').trim();
    if (!query) return safeText(sock, message, context, usage(prefix));

    try {
      const results = await searchSounds(query, {
        limit: Math.max(count, 6),
        cwd: path.join(process.cwd(), 'data', 'scrape-cache'),
      });
      if (!results.length) return safeText(sock, message, context, `❌ No sound results found for: ${query}`);

      const downloadable = results.filter((r) => r.downloadable && r.mediaUrl).slice(0, count);
      let sent = 0;
      for (const item of downloadable) {
        try {
          const mime = /\.(ogg|oga|opus)(?:\?|$)/i.test(item.mediaUrl) ? 'audio/ogg; codecs=opus' : 'audio/mpeg';
          await sendAudio(sock, message, context, item.mediaUrl, mime);
          sent++;
        } catch (err) {
          console.warn('[SCRAPE/SOUND] audio send failed:', err.message);
        }
      }

      if (sent) return undefined;

      // Never rip YouTube. Return the official pages instead.
      const links = results.slice(0, count).map((r, i) => `${i + 1}. ${r.title}\n${r.pageUrl}`).join('\n\n');
      return safeText(sock, message, context, `🔊 Sound results\n\n${links}`);
    } catch (err) {
      console.error('[SCRAPE/SOUND] search failed:', err);
      return safeText(sock, message, context, `❌ Sound scrape failed: ${err.message}`);
    }
  },
};
