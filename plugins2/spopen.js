'use strict';
const core = require('./spotify-core.cjs');

module.exports = {
  command: 'spopen',
  aliases: [],
  category: 'spotify-tools',
  description: 'Send the Spotify URL from a -sp result',
  usage: '-spopen <token> <1-5>',
  async handler(sock, message, args = []) {
    const chatId = message.key.remoteJid;
    const state = core.getSession(args[0], chatId);
    const n = Number(args[1]);
    if (!state) return sock.sendMessage(chatId, { text: '❌ This Spotify search expired. Run -sp again.' }, { quoted: message });
    if (!Number.isInteger(n) || n < 1 || n > state.items.length) return sock.sendMessage(chatId, { text: `❌ Choose a result from 1-${state.items.length}.` }, { quoted: message });
    const track = state.items[n - 1];
    return sock.sendMessage(chatId, { text: `🔗 *${track.title}*\n${track.artists}\n\n${track.url || 'No URL'}` }, { quoted: message });
  },
};
