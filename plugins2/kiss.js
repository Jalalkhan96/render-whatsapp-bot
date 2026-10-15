const reaction = require('../plugins/reaction');

module.exports = {
  command: 'kiss',
  aliases: ['kissapi'],
  category: 'anime',
  description: 'Anime reaction sticker',
  usage: '.kiss',
  async handler(sock, message, args, context = {}) {
    return reaction.handler(sock, message, ['kiss', ...(args || [])], context);
  },
};
