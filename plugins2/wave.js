const reaction = require('../plugins/reaction');

module.exports = {
  command: 'wave',
  aliases: ['waveapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.wave',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['wave', ...(args || [])], context);
  },
};
