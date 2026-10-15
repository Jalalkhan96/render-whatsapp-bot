const reaction = require('../plugins/reaction');

module.exports = {
  command: 'cuddle',
  aliases: ['cuddleapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.cuddle',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['cuddle', ...(args || [])], context);
  },
};
