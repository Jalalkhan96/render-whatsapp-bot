const { PLACEHOLDER_GAMES } = require('../lib/gameManager');

module.exports = PLACEHOLDER_GAMES.map(game => ({
  command: game,
  aliases: game === 'connect4' ? ['connect-four'] : [],
  category: 'games',
  description: `${game} game (coming soon)`,
  async handler(sock, message, args, context = {}) {
    const jid = context.chatId || message.key.remoteJid;
    await sock.sendMessage(jid, {
      text: `🎮 *${game.toUpperCase()}* is on the game roadmap.\n\nUse *.game* to play TicTacToe now.`,
    }, { quoted: message });
  },
}));
