const reaction = require('../plugins/reaction');

module.exports = {
  command: 'cry',
  aliases: ['cryapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.cry',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['cry', ...(args || [])], context);
  },
};
