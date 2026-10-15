'use strict';

const fs = require('fs');
const path = require('path');
const { getJid, safeText } = require('./engines/shared.cjs');

module.exports = {
  command: 'scrapestatus',
  aliases: ['scrapestate'],
  category: 'scrape',
  description: 'Check API-key-free scrape engine availability',
  permission: 'PUBLIC/DEFAULT',

  async handler(sock, message, args = [], context = {}) {
    const jid = getJid(message, context);
    if (!jid) return;
    const checks = [];
    const files = [
      ['Meme engine', './engines/meme-search-engine/src/index.cjs'],
      ['Sound engine', './engines/sound-meme-engine/src/index.cjs'],
      ['Pinterest scraper', './engines/pinterest/index.cjs'],
    ];
    for (const [name, rel] of files) {
      try {
        const full = path.join(__dirname, rel);
        checks.push(`${fs.existsSync(full) ? '✅' : '❌'} ${name}`);
      } catch {
        checks.push(`❌ ${name}`);
      }
    }
    return safeText(sock, message, context, [
      '╭━━━〔 🛠️ *SCRAPE STATUS* 〕━━━╮',
      '┃',
      '┃ ' + checks.join('\n┃ '),
      '┃',
      '┃ 📌 Pinterest: direct scraper (no key)',
      '┃ 🔁 Apify tokens: optional search fallback',
      '┃ 🧩 Meme: key-free public sources',
      '┃ 🔊 Sound: key-free public sources',
      '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    ].join('\n'));
  },
};
