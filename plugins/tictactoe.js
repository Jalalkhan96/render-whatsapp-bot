const { GameManager } = require('../lib/gameManager');

// Kept on the plugin export for backwards compatibility with integrations that
// used the old games object.
const manager = new GameManager();

function mentionTarget(message, args) {
  const mentioned = message?.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    message?.message?.imageMessage?.contextInfo?.mentionedJid || [];
  return mentioned[0] || String(args.find(arg => /^@?\d{5,}$/.test(arg)) || '').replace(/^@/, '');
}

function boardText(game) {
  return game.board.render().map(value => ({ X: '❎', O: '⭕' }[value] || `${value}️⃣`))
    .reduce((rows, cell, index) => {
      rows[Math.floor(index / 3)] += cell;
      return rows;
    }, ['', '', '']).join('\n');
}

function gameText(game) {
  return `🎮 *TicTacToe*\n\n${boardText(game)}\n\n❎ @${game.x.split('@')[0]}\n⭕ @${game.o.split('@')[0]}\n${game.state === 'PLAYING' ? `\nTurn: @${game.board.currentTurn.split('@')[0]}\nReply with 1-9, *surrender* or *cancel*.` : ''}`;
}

async function send(sock, jid, text, message, mentions = []) {
  return sock.sendMessage(jid, { text, mentions }, message ? { quoted: message } : undefined);
}

async function handleTicTacToeMove(sock, chatId, senderId, text) {
  const game = manager.findForPlayer(senderId, 'PLAYING');
  if (!game) return false;
  const value = String(text).toLowerCase().trim();
  let result;
  if (value === 'surrender' || value === 'give up') result = manager.surrender(game.id, senderId);
  else if (value === 'cancel') result = manager.cancel(game.id, 'Cancelled by player');
  else if (/^[1-9]$/.test(value)) result = manager.move(game.id, senderId, Number(value) - 1);
  else return false;
  if (result?.error) return send(sock, chatId, `❌ ${result.error}`, null);
  if (!result) return true;
  const current = result.game || game;
  let status = '';
  if (result.winner) status = `\n🏆 @${result.winner.split('@')[0]} wins!`;
  else if (result.draw) status = '\n🤝 Draw game!';
  else if (current.state === 'CANCELLED') status = `\n🛑 ${current.reason}.`;
  await send(sock, chatId, gameText(current) + status, null, [current.x, current.o, result.winner].filter(Boolean));
  return true;
}

module.exports = {
  command: 'tictactoe',
  aliases: ['ttt', 'xo'],
  category: 'games',
  description: 'Challenge another user to TicTacToe',
  usage: '.tictactoe @user',
  groupOnly: false,
  manager,
  games: manager.games,
  handleTicTacToeMove,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const senderId = context.senderId || message.key.participant || chatId;
    const action = String(args[0] || '').toLowerCase();
    const active = manager.findForPlayer(senderId, 'PLAYING') || manager.findForPlayer(senderId, 'CHALLENGE');

    if (['accept', 'yes'].includes(action)) {
      const result = manager.accept(args[1], senderId);
      if (result.error) return send(sock, chatId, `❌ ${result.error}`, message);
      return send(sock, chatId, `✅ Challenge accepted!\n\n${gameText(result.game)}`, message, [result.game.x, result.game.o, result.game.board.currentTurn]);
    }
    if (['reject', 'decline', 'no'].includes(action)) {
      const result = manager.reject(args[1], senderId);
      return send(sock, chatId, result.error ? `❌ ${result.error}` : '❌ Challenge rejected.', message);
    }
    if (action === 'rematch') {
      const result = manager.rematch(args[1], senderId);
      if (result.error) return send(sock, chatId, `❌ ${result.error}`, message);
      return send(sock, chatId, `🔁 Rematch challenge created!\n\nAccept with *.ttt accept ${result.game.id}*.`, message, [result.game.x, result.game.o]);
    }
    if (['cancel', 'surrender'].includes(action) && active) {
      if (action === 'cancel' && active.state === 'CHALLENGE') {
        manager.cancel(active.id, 'Challenge cancelled');
        return send(sock, chatId, '🛑 Challenge cancelled.', message);
      }
      return handleTicTacToeMove(sock, chatId, senderId, action);
    }
    if (active) return send(sock, chatId, '❌ You are already in a game. Use *surrender* to leave it.', message);

    const opponent = mentionTarget(message, args);
    const result = manager.challenge({ player: senderId, opponent: opponent || null, chatId });
    if (result.error) return send(sock, chatId, `❌ ${result.error}`, message);
    const game = result.game;
    if (!opponent) {
      return send(sock, chatId, `🎮 Challenge created!\n\nRoom: *${game.id}*\nAnother player can accept with *.ttt accept ${game.id}*.\nChallenge expires in 60 seconds.`, message, [senderId]);
    }
    return send(sock, chatId, `🎮 @${senderId.split('@')[0]} challenged you to TicTacToe!\n\nAccept: *.ttt accept ${game.id}*\nReject: *.ttt reject ${game.id}*`, message, [senderId, opponent]);
  },
};
