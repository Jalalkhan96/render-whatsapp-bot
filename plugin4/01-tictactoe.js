// Auto-adapted from supplied 50-game plugin: 01-tictactoe.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["ttt", "tictactoe"];
const SOURCE_NAME = "tictactoe";
const PRIMARY = "g4tictactoe";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'tictactoe',
  category: 'games',
  description: 'Play Tic-Tac-Toe with another player',
  commands: ['ttt', 'tictactoe'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const gameId = `ttt-${jid}-${Date.now()}`;
      games.set(gameId, {
        board: ['1','2','3','4','5','6','7','8','9'],
        players: { X: sender, O: null },
        turn: 'X',
        moves: 0
      });
      return reply(`🎮 *Tic-Tac-Toe* started!\n\n${renderBoard(games.get(gameId).board)}\n\nWaiting for opponent to join with .ttt join`);
    }

    if (sub === 'join') {
      const game = [...games.entries()].find(([id]) => id.startsWith('ttt-') && id.endsWith(jid));
      if (!game) return reply('No active game. Start with .ttt start');
      const [id, g] = game;
      if (g.players.O) return reply('Game already has 2 players!');
      g.players.O = sender;
      return reply(`✅ Game started!\n\n${renderBoard(g.board)}\n\n@${g.players.X.split('@')[0]} (X) goes first.`, { mentions: [g.players.X, sender] });
    }

    if (sub === 'move') {
      const position = parseInt(args[1]);
      const game = [...games.entries()].find(([id, g]) => (g.players.X === sender || g.players.O === sender) && id.includes(jid));
      if (!game) return reply('No active game. Start with .ttt start');
      
      const [id, g] = game;
      if (!g.players.O) return reply('Waiting for opponent to join.');
      
      const symbol = g.players.X === sender ? 'X' : (g.players.O === sender ? 'O' : null);
      if (!symbol) return reply('You are not in this game!');
      if (g.turn !== symbol) return reply('Not your turn!');
      if (isNaN(position) || position < 1 || position > 9 || g.board[position - 1] !== String(position)) return reply('Invalid move! Position must be 1-9 and empty.');
      
      g.board[position - 1] = symbol;
      g.turn = symbol === 'X' ? 'O' : 'X';
      g.moves++;
      
      const winner = checkWinner(g.board);
      if (winner) {
        games.delete(id);
        const winnerPlayer = winner === 'X' ? g.players.X : g.players.O;
        return reply(`🏆 @${winnerPlayer.split('@')[0]} (${winner}) wins!\n\n${renderBoard(g.board)}`, { mentions: [g.players.X, g.players.O] });
      }
      
      if (g.moves === 9) {
        games.delete(id);
        return reply(`🤝 Draw!\n\n${renderBoard(g.board)}`, { mentions: [g.players.X, g.players.O] });
      }
      
      return reply(`🎮 Tic-Tac-Toe\n\n${renderBoard(g.board)}\n\n@${g.players[g.turn].split('@')[0]} (${g.turn})'s turn.`, { mentions: [g.players.X, g.players.O] });
    }

    if (sub === 'end') {
      const game = [...games.entries()].find(([id, g]) => (g.players.X === sender || g.players.O === sender) && id.includes(jid));
      if (game) games.delete(game[0]);
      return reply('Game ended.');
    }

    reply('*Tic-Tac-Toe*\n.ttt start - Start game\n.ttt join - Join game\n.ttt move <1-9> - Make move\n.ttt end - End game');
  }
};

function renderBoard(b) {
  return `${b[0]} | ${b[1]} | ${b[2]}\n---------\n${b[3]} | ${b[4]} | ${b[5]}\n---------\n${b[6]} | ${b[7]} | ${b[8]}`;
}

function checkWinner(b) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a, b1, c] of lines) {
    if (b[a] === b[b1] && b[b1] === b[c] && (b[a] === 'X' || b[a] === 'O')) return b[a];
  }
  return null;
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
  aliases: ["g4ttt"],
  category: 'games',
  description: "Game: tictactoe",
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
