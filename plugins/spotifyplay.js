const spotify = require('./spotify');

module.exports = {
  command: 'spotifyplay',
  aliases: ['sfplay'],
  category: 'downloader',
  description: 'Download music from Spotify',
  usage: '.spotifyplay <judul lagu>',
  async handler(sock, message, args, context = {}) {
    return spotify.handler(sock, message, args, context);
  }
};
