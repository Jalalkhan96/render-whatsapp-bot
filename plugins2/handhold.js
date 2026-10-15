const reaction = require('../plugins/reaction');

module.exports = {
  command: 'handhold',
  aliases: ['handholdapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.handhold',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['handhold', ...(args || [])], context);
  },
};
