'use strict';
const style = require('./styles/stackedCards');
const { sendNativeFlow } = require('./nativeFlow');

module.exports = {
  command: 'gamearcadetest',
  aliases: [],
  category: 'games',
  description: 'Standalone native-flow Game Arcade test',
  buildGameArcade: style.build,
  async handler(sock, message, args, context = {}) {
    const jid = context.chatId || message?.key?.remoteJid;
    if (!jid) throw new Error('Chat JID is missing.');
    return sendNativeFlow(sock, jid, style.build(), { quoted: undefined });
  },
};
