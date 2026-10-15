const reaction = require('../plugins/reaction');

module.exports = {
  command: 'bonk',
  aliases: ['bonkapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.bonk',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['bonk', ...(args || [])], context);
  },
};
