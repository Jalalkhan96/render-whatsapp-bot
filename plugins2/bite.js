const reaction = require('../plugins/reaction');

module.exports = {
  command: 'bite',
  aliases: ['biteapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.bite',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['bite', ...(args || [])], context);
  },
};
