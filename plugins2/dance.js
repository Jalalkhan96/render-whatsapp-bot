const reaction = require('../plugins/reaction');

module.exports = {
  command: 'dance',
  aliases: ['danceapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.dance',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['dance', ...(args || [])], context);
  },
};
