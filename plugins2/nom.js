const reaction = require('../plugins/reaction');

module.exports = {
  command: 'nom',
  aliases: ['nomapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.nom',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['nom', ...(args || [])], context);
  },
};
