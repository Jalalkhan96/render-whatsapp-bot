// Auto-adapted from supplied 50-game plugin: 46-sudoku.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["sudoku", "sud"];
const SOURCE_NAME = "sudoku";
const PRIMARY = "sudoku";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'sudoku',
  category: 'games',
  description: 'Play Sudoku',
  commands: ['sudoku', 'sud'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      // Simplified sudoku puzzle
      const puzzle = [
        [5,3,0,0,7,0,0,0,0],
        [6,0,0,1,9,5,0,0,0],
        [0,9,8,0,0,0,0,6,0],
        [8,0,0,0,6,0,0,0,3],
        [4,0,0,8,0,3,0,0,1],
        [7,0,0,0,2,0,0,0,6],
        [0,6,0,0,0,0,2,8,0],
        [0,0,0,4,1,9,0,0,5],
        [0,0,0,0,8,0,0,7,9]
      ];
      games.set(sender, { puzzle });
      return reply(`🧩 *Sudoku*\n\n${renderSudoku(puzzle)}\n\n.sudoku place <row> <col> <num>`);
    }

    if (sub === 'place') {
      const game = games.get(sender);
      if (!game) return reply('Start with .sudoku start');
      
      const [r, c, n] = [parseInt(args[1]) - 1, parseInt(args[2]) - 1, parseInt(args[3])];
      if (isNaN(r) || isNaN(c) || isNaN(n) || n < 1 || n > 9) return reply('Usage: .sudoku place <row> <col> <num>');
      
      if (game.puzzle[r][c] !== 0) return reply('Cell already filled!');
      game.puzzle[r][c] = n;
      
      return reply(`🧩 *Sudoku*\n\n${renderSudoku(game.puzzle)}`);
    }

    reply('*Sudoku*\n.sudoku start\n.sudoku place <row> <col> <num>');
  }
};

function renderSudoku(g) {
  return g.map(row => row.map(v => v === 0 ? '⬜' : v).join(' ')).join('\n');
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
  aliases: ["sud", "g4sudoku"],
  category: 'games',
  description: "Game: sudoku",
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
