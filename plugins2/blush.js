const reaction = require('../plugins/reaction');

module.exports = {
  command: 'blush',
  aliases: ['blushapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.blush',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['blush', ...(args || [])], context);
  },
};
