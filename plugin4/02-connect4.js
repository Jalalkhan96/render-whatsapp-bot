// Auto-adapted from supplied 50-game plugin: 02-connect4.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["c4", "connect4"];
const SOURCE_NAME = "connect4";
const PRIMARY = "c4";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'connect4',
  category: 'games',
  description: 'Play Connect Four',
  commands: ['c4', 'connect4'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const gameId = `c4-${jid}-${Date.now()}`;
      games.set(gameId, {
        board: Array(6).fill().map(() => Array(7).fill('⚫')),
        players: { R: sender, Y: null },
        turn: 'R'
      });
      return reply(`🔴 *Connect Four* started!\n\n${renderBoard(games.get(gameId).board)}\n\nWaiting for opponent to join with .c4 join`);
    }

    if (sub === 'join') {
      const game = [...games.entries()].find(([id]) => id.startsWith('c4-') && id.includes(jid));
      if (!game) return reply('No active game.');
      const [id, g] = game;
      if (g.players.Y) return reply('Game full!');
      g.players.Y = sender;
      return reply(`✅ Game started!\n\n${renderBoard(g.board)}\n\n@${g.players.R.split('@')[0]} (🔴) goes first.`, { mentions: [g.players.R, sender] });
    }

    if (sub === 'drop') {
      const col = parseInt(args[1]) - 1;
      const game = [...games.entries()].find(([id, g]) => (g.players.R === sender || g.players.Y === sender) && id.includes(jid));
      if (!game) return reply('No active game.');
      
      const [id, g] = game;
      if (!g.players.Y) return reply('Waiting for opponent.');
      
      const symbol = g.players.R === sender ? 'R' : (g.players.Y === sender ? 'Y' : null);
      if (!symbol) return reply('Not in this game!');
      if (g.turn !== symbol) return reply('Not your turn!');
      if (col < 0 || col > 6) return reply('Column 1-7!');
      
      let row = -1;
      for (let r = 5; r >= 0; r--) {
        if (g.board[r][col] === '⚫') {
          row = r;
          break;
        }
      }
      
      if (row === -1) return reply('Column full!');
      
      g.board[row][col] = symbol === 'R' ? '🔴' : '🟡';
      g.turn = symbol === 'R' ? 'Y' : 'R';
      
      const winner = checkWin(g.board, symbol);
      if (winner) {
        games.delete(id);
        const winnerPlayer = symbol === 'R' ? g.players.R : g.players.Y;
        return reply(`🏆 @${winnerPlayer.split('@')[0]} wins!\n\n${renderBoard(g.board)}`, { mentions: [g.players.R, g.players.Y] });
      }
      
      return reply(`🔴 Connect Four\n\n${renderBoard(g.board)}\n\n@${g.players[g.turn].split('@')[0]} (${g.turn === 'R' ? '🔴' : '🟡'})'s turn.`, { mentions: [g.players.R, g.players.Y] });
    }

    if (sub === 'end') {
      const game = [...games.entries()].find(([id, g]) => (g.players.R === sender || g.players.Y === sender) && id.includes(jid));
      if (game) games.delete(game[0]);
      return reply('Game ended.');
    }

    reply('*Connect Four*\n.c4 start\n.c4 join\n.c4 drop <1-7>\n.c4 end');
  }
};

function renderBoard(b) {
  return b.map(row => row.join('')).join('\n');
}

function checkWin(b, s) {
  const symbol = s === 'R' ? '🔴' : '🟡';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      if (c + 3 < 7 && b[r][c] === symbol && b[r][c+1] === symbol && b[r][c+2] === symbol && b[r][c+3] === symbol) return true;
      if (r + 3 < 6 && b[r][c] === symbol && b[r+1][c] === symbol && b[r+2][c] === symbol && b[r+3][c] === symbol) return true;
      if (r + 3 < 6 && c + 3 < 7 && b[r][c] === symbol && b[r+1][c+1] === symbol && b[r+2][c+2] === symbol && b[r+3][c+3] === symbol) return true;
      if (r + 3 < 6 && c - 3 >= 0 && b[r][c] === symbol && b[r+1][c-1] === symbol && b[r+2][c-2] === symbol && b[r+3][c-3] === symbol) return true;
    }
  }
  return false;
}


return GAME;
})();

function rewrite(value, prefix) {
  if (typeof value !== 'string') return value;
  let out=value;
  for (const c of SOURCE_COMMANDS) {
    const escaped=String(c).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    out=out.replace(new RegExp('\\.'+escaped+'\\b','gi'), String(prefix||'.')+PRIMARY);
  }
  return out;
}

module.exports={
  command: PRIMARY,
  aliases: ["connect4", "g4connect4", "g4c4"],
  category: 'games',
  description: "Game: connect4",
  gameId: String(SOURCE_NAME).toLowerCase(),
  async handler(sock,message,args,context={}) {
    const jid=context.chatId||message.key.remoteJid;
    const sender=context.senderId||message.key.participant||jid;
    const prefix=context.prefix||'.';
    let lastText=''; let lastMentions=[];
    const reply=async(value,opts={})=>{
      const adapted=rewrite(value,prefix);
      if(typeof adapted==='string') lastText=adapted;
      lastMentions=Array.isArray(opts.mentions)?opts.mentions.slice():[];
      return sock.sendMessage(jid, {text:String(adapted??''), ...(lastMentions.length?{mentions:lastMentions}:{})}, {quoted:message});
    };
    try {
      const result=await ORIGINAL.handler({args,jid,sender,reply,msg:message,message,sock,prefix,context,command:PRIMARY});
      rank.record(String(SOURCE_NAME).toLowerCase(),{sender,participants:lastMentions,sub:args?.[0]||'',replyText:lastText,replyMentions:lastMentions});
      return result;
    } catch(error) {
      console.error(`[PLUGIN4 ${SOURCE_NAME}]`,error);
      rank.record(String(SOURCE_NAME).toLowerCase(),{sender,participants:lastMentions,sub:args?.[0]||'',replyText:lastText,replyMentions:lastMentions});
      throw error;
    }
  }
};
