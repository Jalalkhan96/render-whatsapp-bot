const reaction = require('../plugins/reaction');

module.exports = {
  command: 'glomp',
  aliases: ['glompapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.glomp',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['glomp', ...(args || [])], context);
  },
};
