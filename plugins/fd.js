'use strict';

// Uses the exact same per-chat selection cache as -font and -fontdb.
const fontPlugin = require('./font-downloader.js');

module.exports = {
  command: 'fd',
  aliases: ['fontdownload', 'downloadfont'],
  category: 'utility',
  description: 'Return download URLs for fonts from the most recent search/list.',
  usage: '-fd 1 | -fd 1,3,5 | -fd all',
  handler: async (sock, message, args = [], context = {}) => {
    const selection = String(args?.join(' ') || '').trim().toLowerCase();
    if (!selection) {
      const prefix = context?.prefix || '-';
      return sock.sendMessage(context?.chatId || message.key.remoteJid, {
        text: `Usage: ${prefix}fd <number|number,number|all>`,
      }, { quoted: message });
    }
    return fontPlugin.downloadSelectedFonts(sock, message, context, selection);
  },
};
