const reaction = require('../plugins/reaction');

module.exports = {
  command: 'hug',
  aliases: ['hugapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.hug',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['hug', ...(args || [])], context);
  },
};
