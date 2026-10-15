const reaction = require('../plugins/reaction');

module.exports = {
  command: 'awoo',
  aliases: ['awooapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.awoo',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['awoo', ...(args || [])], context);
  },
};
