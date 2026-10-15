const reaction = require('../plugins/reaction');

module.exports = {
  command: 'cringe',
  aliases: ['cringeapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.cringe',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['cringe', ...(args || [])], context);
  },
};
