'use strict';

module.exports = {
  command: 'spltmenu',
  aliases: ['spotifytools', 'spotifymenu', 'sptmenu'],
  category: 'spotify-tools',
  // This menu must execute its own handler; the command framework otherwise
  // treats every *menu command as a generic dedicated-category renderer.
  dedicatedMenu: false,
  description: 'Show the separate Spotify playlist/search commands',
  usage: '-spltmenu',
  async handler(sock, message) {
    const jid = message.key.remoteJid;
    const text = [
      '🎧 *SPOTIFY PLAYLIST TOOLS*',
      '',
      '🎵 *-sp <song name>*',
      'Search Spotify → top 5 slider → official preview download',
      '',
      '📚 *-splt <playlist URL/name>*',
      'Fetch playlist/album → top 5 slider + full tracklist TXT',
      '',
      '📦 *-spltz <playlist URL/name>*',
      'Send playlist ZIP → metadata + available official preview samples',
      '',
      '🎶 *-splts <playlist URL/name>*',
      'Send every available official preview one-by-one',
      '',
      'ℹ️ Full-length commercial-track ripping is not included; downloads are limited to Spotify-provided official preview samples.',
    ].join('\n');
    return sock.sendMessage(jid, { text }, { quoted: message });
  },
};
