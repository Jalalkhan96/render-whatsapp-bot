'use strict';

const { getJid, getPrefix, safeText } = require('./engines/shared.cjs');

module.exports = {
  command: 'scrapemenu',
  aliases: ['scrapemenu2'],
  category: 'scrape',
  description: 'Show the API-key-free scrape command menu',
  permission: 'PUBLIC/DEFAULT',

  async handler(sock, message, args = [], context = {}) {
    const jid = getJid(message, context);
    if (!jid) return;
    const p = getPrefix(context);
    return safeText(sock, message, context, [
      '╭━━━〔 🕷️ *ABIX SCRAPE HUB* 〕━━━╮',
      '┃',
      '┃ 🧩 *MEMES*',
      `┃ ${p}scrapememe Pepe`,
      `┃ ${p}scrapememe 5 Pepe frog`,
      '┃',
      '┃ 🔊 *SOUNDS*',
      `┃ ${p}scrapesound vine boom`,
      `┃ ${p}scrapesound 3 anime laugh`,
      '┃',
      '┃ 📌 *PINTEREST*',
      `┃ ${p}pinscrape Naruto wallpaper`,
      `┃ ${p}pinscrape 5 Pepe frog`,
      `┃ ${p}pinscrape https://www.pinterest.com/pin/...`,
      `┃ ${p}pinscrape video 5 cyberpunk aesthetics`,
      `┃ ${p}pintest cyberpunk aesthetics`,
      `┃ ${p}pintest video 5 cyberpunk aesthetics`,
      `┃ ${p}pinsearch 5 cyberpunk aesthetics`,
      `┃ ${p}pinsimilar cyberpunk aesthetics`,
      `┃ ${p}pinapify cyberpunk aesthetics (Apify backup)`,
      `┃ ${p}pindl video https://www.pinterest.com/pin/...`,
      '┃',
      '┃ 🔧 *STATUS*',
      `┃ ${p}scrapestatus`,
      '┃',
      '┃ ✅ Direct Pinterest scraper runs first.',
      '┃ 🔁 Apify token pool is retained as backup.',
      '┃ 🎞️ Image and video media are supported.',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    ].join('\n'));
  },
};
