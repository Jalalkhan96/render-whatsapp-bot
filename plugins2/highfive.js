const reaction = require('../plugins/reaction');

module.exports = {
  command: 'highfive',
  aliases: ['highfiveapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.highfive',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['highfive', ...(args || [])], context);
  },
};
