const ttt = require('./tictactoe');

const catalog = {
  multiplayer: ['tictactoe', 'rps', 'connect4', 'chess', 'checkers', 'battleship', 'hangman', 'wordguess', 'numberguess'],
  brain: ['memory', 'mathbattle', 'fasttype', '2048', 'minesweeper', 'snake'],
  quick: ['dice', 'coinflip', 'blackjack', 'rps', 'numberguess'],
  quiz: ['quiz', 'trivia', 'cricketquiz', 'generalquiz'],
};

function jid(context, message) {
  return context.chatId || message.key.remoteJid;
}

function sender(context, message) {
  return context.senderId || message.key.participant || message.key.remoteJid;
}

function list(category, prefix) {
  return `🎮 *${category.toUpperCase()} GAMES*\n\n${catalog[category].map(name => `• ${prefix}${name}`).join('\n')}`;
}

module.exports = [
  ...Object.entries(catalog).map(([category]) => ({
    command: `game${category}`,
    aliases: [],
    category: 'games',
    description: `Show ${category} games`,
    async handler(sock, message, args, context = {}) {
      await sock.sendMessage(jid(context, message), {
        text: list(category, context.prefix || '.'),
      }, { quoted: message });
    },
  })),
  {
    command: 'gamecancel',
    aliases: ['game-cancel'],
    category: 'games',
    description: 'Cancel your waiting or active TicTacToe game',
    async handler(sock, message, args, context = {}) {
      const player = sender(context, message);
      const game = ttt.manager.findForPlayer(player);
      if (!game) {
        return sock.sendMessage(jid(context, message), { text: '❌ You have no waiting or active game.' }, { quoted: message });
      }
      ttt.manager.cancel(game.id, 'Game cancelled');
      return sock.sendMessage(jid(context, message), { text: '🛑 Game cancelled. You can start another game now.' }, { quoted: message });
    },
  },
  {
    command: 'gamerules',
    aliases: ['game-rules'],
    category: 'games',
    description: 'Show game rules',
    async handler(sock, message, args, context = {}) {
      return sock.sendMessage(jid(context, message), {
        text: '📖 *GAME RULES*\n\nTicTacToe: players take turns choosing an empty number from 1-9. Three symbols in a row wins. Only the current player can move. A game times out after inactivity. Use surrender or -gamecancel to leave.',
      }, { quoted: message });
    },
  },
  {
    command: 'gamestats',
    aliases: ['game-stats'],
    category: 'games',
    description: 'Show your game statistics',
    async handler(sock, message, args, context = {}) {
      const stats = ttt.manager.stats.get(sender(context, message)) || { played: 0, wins: 0, losses: 0, draws: 0, surrenders: 0 };
      const rate = stats.played ? ((stats.wins / stats.played) * 100).toFixed(1) : '0.0';
      return sock.sendMessage(jid(context, message), {
        text: `📊 *GAME STATS*\nPlayed: ${stats.played}\nWins: ${stats.wins}\nLosses: ${stats.losses}\nDraws: ${stats.draws}\nWin rate: ${rate}%\nSurrenders: ${stats.surrenders}`,
      }, { quoted: message });
    },
  },
  {
    command: 'gamerank',
    aliases: ['gametop', 'game-rank', 'game-top'],
    category: 'games',
    description: 'Show the game leaderboard',
    async handler(sock, message, args, context = {}) {
      const rows = ttt.manager.leaderboard().map((row, i) => `${i + 1}. @${row.player.split('@')[0]} — ${row.wins}W / ${row.played} games`);
      const mentions = ttt.manager.leaderboard().map(row => row.player);
      return sock.sendMessage(jid(context, message), {
        text: `🏅 *GAME LEADERBOARD*\n\n${rows.join('\n') || 'No games played yet.'}`,
        mentions,
      }, { quoted: message });
    },
  },
];
