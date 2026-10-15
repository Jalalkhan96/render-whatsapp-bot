'use strict';

// Compatibility wrapper. The older carousel/native-flow game menu could show
// "Update WhatsApp" on clients that reject native interactive messages.
// Delegate the game center to the client-safe plugins2 arcade instead.
const arcade = require('../plugins2/wa-tricks/wa-trick-games.cjs');

module.exports = {
  command: 'gamemenu',
  aliases: ['games', 'play', 'gamecenter', 'arcade'],
  category: 'games',
  description: 'Open the client-safe Game Arcade',
  dedicatedMenu: false,
  async handler(sock, message, args, context = {}) {
    const jid = context.chatId || message?.key?.remoteJid;
    const prefix = context.prefix || '-';
    const page = Math.max(1, Number(args[0]) || 1);
    return arcade.sendArcadeMenu(sock, jid, null, page, prefix);
  },
};
