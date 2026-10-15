const reaction = require('../plugins/reaction');

module.exports = {
  command: 'slap',
  aliases: ['slapapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.slap',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['slap', ...(args || [])], context);
  },
};
