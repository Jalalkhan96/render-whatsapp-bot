const reaction = require('../plugins/reaction');

module.exports = {
  command: 'smile',
  aliases: ['smileapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.smile',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['smile', ...(args || [])], context);
  },
};
