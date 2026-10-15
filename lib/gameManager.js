const TicTacToe = require('./tictactoe');

const PLACEHOLDER_GAMES = [
  'rps', 'connect4', 'checkers', 'battleship', 'hangman', 'wordguess',
  'numberguess', 'memory', 'mathbattle', 'fasttype', '2048', 'minesweeper',
  'snake', 'dice', 'coinflip', 'blackjack', 'quiz', 'trivia', 'cricketquiz',
  'generalquiz',
];

class GameManager {
  constructor(options = {}) {
    this.games = new Map();
    this.stats = new Map();
    this.challengeTimeout = options.challengeTimeout || 120_000;
    this.turnTimeout = options.turnTimeout || 300_000;
    this._id = 0;
  }

  _stats(player) {
    if (!this.stats.has(player)) this.stats.set(player, { played: 0, wins: 0, losses: 0, draws: 0, surrenders: 0 });
    return this.stats.get(player);
  }

  _result(game, result) {
    for (const player of [game.x, game.o]) {
      const stats = this._stats(player);
      stats.played++;
      if (result === 'draw') stats.draws++;
      else if (player === result) stats.wins++;
      else stats.losses++;
    }
  }

  _clearTimer(game) {
    if (game.timer) clearTimeout(game.timer);
    game.timer = null;
  }

  _arm(game, timeout, onExpire) {
    this._clearTimer(game);
    game.timer = setTimeout(() => {
      if (this.games.get(game.id) === game) onExpire();
    }, timeout);
  }

  _newGame(x, chatId, opponent) {
    const id = `ttt-${Date.now().toString(36)}-${(++this._id).toString(36)}`;
    const game = {
      id, type: 'tictactoe', state: 'CHALLENGE', x, o: opponent || null, chatId,
      board: new TicTacToe(x, opponent || 'pending'), createdAt: Date.now(), rematchOf: null,
    };
    this.games.set(id, game);
    this._arm(game, this.challengeTimeout, () => this.cancel(id, 'Challenge expired'));
    return game;
  }

  findForPlayer(player, state) {
    return [...this.games.values()].find(game =>
      game.type === 'tictactoe' &&
      (state ? game.state === state : ['CHALLENGE', 'PLAYING'].includes(game.state)) &&
      (game.x === player || game.o === player)
    ) || null;
  }

  challenge({ player, opponent, chatId }) {
    if (this.findForPlayer(player)) return { error: 'You are already in a game.' };
    if (opponent && opponent === player) return { error: 'You cannot challenge yourself.' };
    if (opponent && this.findForPlayer(opponent)) return { error: 'That player is already in a game.' };
    return { game: this._newGame(player, chatId, opponent) };
  }

  accept(id, player) {
    const game = this.games.get(id);
    if (!game || game.state !== 'CHALLENGE') return { error: 'Challenge not found or expired.' };
    if (game.o && game.o !== player) return { error: 'Only the challenged player can accept.' };
    if (!game.o) game.o = player;
    game.board.playerO = player;
    game.state = 'PLAYING';
    this._arm(game, this.turnTimeout, () => this.cancel(id, 'Turn timed out'));
    return { game };
  }

  reject(id, player) {
    const game = this.games.get(id);
    if (!game || game.state !== 'CHALLENGE') return { error: 'Challenge not found or expired.' };
    if (player !== game.x && player !== game.o) return { error: 'You are not part of this challenge.' };
    this._clearTimer(game); this.games.delete(id);
    return { game };
  }

  move(id, player, position) {
    const game = this.games.get(id);
    if (!game || game.state !== 'PLAYING') return { error: 'No active game.' };
    if (game.board.currentTurn !== player) return { error: 'It is not your turn.' };
    const result = game.board.turn(player, Number(position));
    if (result !== 1) return { error: 'That position is invalid or already taken.' };
    const winner = game.board.winner;
    const draw = !winner && game.board.turns === 9;
    if (winner || draw) {
      game.state = winner ? 'WON' : 'DRAW'; this._clearTimer(game); this._result(game, winner || 'draw');
    } else this._arm(game, this.turnTimeout, () => this.cancel(id, 'Turn timed out'));
    return { game, winner, draw };
  }

  surrender(id, player) {
    const game = this.games.get(id);
    if (!game || game.state !== 'PLAYING') return { error: 'No active game.' };
    if (player !== game.x && player !== game.o) return { error: 'You are not part of this game.' };
    const winner = player === game.x ? game.o : game.x;
    game.state = 'WON'; game.surrenderedBy = player; this._clearTimer(game); this._result(game, winner);
    this._stats(player).surrenders++;
    return { game, winner };
  }

  cancel(id, reason = 'Game cancelled') {
    const game = this.games.get(id);
    if (!game) return null;
    this._clearTimer(game); this.games.delete(id);
    if (game.state === 'PLAYING' && /timed out/i.test(reason)) {
      const winner = game.board.currentTurn === game.x ? game.o : game.x;
      game.state = 'WON'; game.winner = winner; game.reason = reason;
      this._result(game, winner);
    } else {
      game.state = 'CANCELLED'; game.reason = reason;
    }
    return game;
  }

  rematch(id, player) {
    const old = this.games.get(id);
    if (!old || !['WON', 'DRAW'].includes(old.state)) return { error: 'That game is not finished.' };
    if (![old.x, old.o].includes(player)) return { error: 'You are not part of that game.' };
    const next = this._newGame(player, old.chatId, player === old.x ? old.o : old.x);
    next.rematchOf = old.id;
    return { game: next };
  }

  leaderboard(limit = 10) {
    return [...this.stats.entries()].map(([player, value]) => ({ player, ...value }))
      .sort((a, b) => b.wins - a.wins || b.played - a.played).slice(0, limit);
  }
}

module.exports = { GameManager, PLACEHOLDER_GAMES };
