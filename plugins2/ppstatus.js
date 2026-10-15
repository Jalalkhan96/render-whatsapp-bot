'use strict';
const menuState = require('../lib/menuState');
const { sites } = require('./ppcommon');
module.exports = {
  command: 'ppstatus', aliases: ['ppstate'], category: 'owner', ownerOnly: true,
  description: 'Owner-only PP diagnostic status', usage: '-ppstatus',
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const enabled = menuState.isMenuEnabled('ppmenu', chatId);
    return sock.sendMessage(chatId, { text: `🔐 PP TEST MODE\n\nMenu: ${enabled ? 'ON ✅' : 'OFF ❌'}\nTargets: ${sites.length}\nMedia retrieval: DISABLED` }, { quoted: message });
  },
};
