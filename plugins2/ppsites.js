'use strict';
const settings = require('../settings');
const { sites, siteListText } = require('./ppcommon');
module.exports = {
  command: 'ppsites', aliases: ['pplist'], category: 'owner', ownerOnly: true,
  description: 'Owner-only PP target registry', usage: '-ppsites',
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes?.[0] || '-';
    const text = `🔐 *PP TEST TARGETS*\n\n${siteListText(prefix)}\n\nTotal: ${sites.length}`;
    return sock.sendMessage(chatId, { text, contextInfo: {} }, { quoted: message });
  },
};
