'use strict';

const { runBix } = require('../lib/bixRouter');

module.exports = {
  command: 'bix',
  aliases: ['abix'],
  category: 'owner',
  description: 'Owner/secondary-owner AI engineer and bot control center',
  usage: '-bix <request> or @bix <request>',
  ownerOnly: true,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const senderId = context.senderId || message.key.participant || message.key.remoteJid;
    const request = Array.isArray(args) ? args.join(' ').trim() : '';
    await runBix({ sock, message, chatId, senderId, question: request });
  },
};
