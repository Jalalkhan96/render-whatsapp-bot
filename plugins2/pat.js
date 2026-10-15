const reaction = require('../plugins/reaction');

module.exports = {
  command: 'pat',
  aliases: ['patapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.pat',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['pat', ...(args || [])], context);
  },
};
