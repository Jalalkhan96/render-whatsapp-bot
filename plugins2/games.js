'use strict';

const games = require('./wa-tricks/wa-trick-games.cjs');
const tournament = require('./wa-tricks/wa-trick-tournament.cjs');
const path = require('path');
const fs = require('fs');
const scoreFile = path.join(process.cwd(), 'data', 'game-scores.json');
fs.mkdirSync(path.dirname(scoreFile), { recursive: true });
if (typeof tournament.setScoresFile === 'function') tournament.setScoresFile(scoreFile);

const extra = games.GAMES.map((g) => ({
  command: g.cmd,
  aliases: g.cmd === '2048' ? [] : (g.cmd === 'car' ? ['race'] : g.cmd === 'whack' ? ['mole'] : g.cmd === 'tictactoe' ? ['ttt'] : g.cmd === 'shooter' ? ['shoot'] : []),
  category: 'games-tool',
  description: `Play ${g.name}`,
  usage: `-${g.cmd}`,
  dedicatedMenu: false,
  async handler(sock, m, args, c = {}) {
    return games.sendGame(sock, c.chatId || m.key.remoteJid, g.cmd, m, args);
  },
}));

module.exports = [
  {
    command: 'games',
    aliases: ['arcade', 'gamearcade'],
    category: 'games-tool',
    description: 'Show the full Game Arcade',
    usage: '-games',
    dedicatedMenu: false,
    async handler(sock, m, args, c = {}) {
      return games.sendArcadeMenu(sock, c.chatId || m.key.remoteJid, null, 1, c.prefix || '-');
    },
  },
  ...extra,
  { command:'challenge', aliases:[], category:'games-tool', description:'Challenge a player', usage:'-challenge @user dino', async handler(sock,m,args){ return tournament.cmdChallenge(sock,m,args); } },
  { command:'accept', aliases:[], category:'games-tool', description:'Accept a game challenge', usage:'-accept', async handler(sock,m,args){ return tournament.cmdAccept(sock,m,args); } },
  { command:'decline', aliases:['reject'], category:'games-tool', description:'Decline a game challenge', usage:'-decline', async handler(sock,m,args){ return tournament.cmdDecline(sock,m,args); } },
  { command:'score', aliases:[], category:'games-tool', description:'Submit tournament score', usage:'-score dino 450', async handler(sock,m,args){ return tournament.cmdScore(sock,m,args); } },
];
