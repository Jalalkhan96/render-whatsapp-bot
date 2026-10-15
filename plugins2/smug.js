const reaction = require('../plugins/reaction');

module.exports = {
  command: 'smug',
  aliases: ['smugapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.smug',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['smug', ...(args || [])], context);
  },
};
