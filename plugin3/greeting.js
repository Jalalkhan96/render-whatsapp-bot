'use strict';

const { makeGreeting } = require('./greetingAdapter');

module.exports = {
  command: 'greet',
  aliases: ['greeting', 'hello'],
  category: 'fun',
  description: 'Send a time-aware greeting using greeting-ninja',
  usage: '<prefix>greet [name]',
  cooldown: 800,
  async handler(sock, message, args = [], context = {}) {
    const jid = context.chatId || message?.key?.remoteJid;
    if (!jid) return;
    const name = args.join(' ').trim() || message?.pushName || 'there';
    await sock.sendMessage(jid, { text: makeGreeting(name) }, { quoted: message });
  },
};
