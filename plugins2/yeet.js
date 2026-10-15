const reaction = require('../plugins/reaction');

module.exports = {
  command: 'yeet',
  aliases: ['yeetapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.yeet',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['yeet', ...(args || [])], context);
  },
};
