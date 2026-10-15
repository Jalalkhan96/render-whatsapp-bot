// Auto-adapted from supplied 50-game plugin: 33-crossword.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["crossword", "cw"];
const SOURCE_NAME = "crossword";
const PRIMARY = "crossword";
const ORIGINAL = (() => {
const puzzles = [
  { word: 'JAVASCRIPT', hint: 'Programming language for the web' },
  { word: 'WHATSAPP', hint: 'Popular messaging app' },
  { word: 'BAILEYS', hint: 'WhatsApp bot library' },
  { word: 'NODEJS', hint: 'JavaScript runtime environment' },
  { word: 'DATABASE', hint: 'Data storage system' },
  { word: 'FUNCTION', hint: 'Reusable code block' }
];

const GAME = {
  name: 'crossword',
  category: 'games',
  description: 'Word puzzle',
  commands: ['crossword', 'cw'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const p = puzzles[Math.floor(Math.random() * puzzles.length)];
      ctx.db.set(`cw_${sender}`, { word: p.word, hint: p.hint, revealed: [] });
      return reply(`📝 *Crossword*\n\n*Hint:* ${p.hint}\n*Word length:* ${p.word.length}\n\nUse .crossword guess <letter> or .crossword solve <word>`);
    }

    if (sub === 'guess') {
      const game = ctx.db.get(`cw_${sender}`);
      if (!game) return reply('Start with .crossword start');
      
      const letter = args[1]?.toUpperCase();
      if (!letter || letter.length !== 1) return reply('Guess one letter');
      
      if (game.revealed.includes(letter)) return reply('Already guessed!');
      
      game.revealed.push(letter);
      ctx.db.set(`cw_${sender}`, game);
      
      const display = game.word.split('').map(c => game.revealed.includes(c) ? c : '_').join(' ');
      return reply(`📝 ${display}\n\nGuessed: ${game.revealed.join(', ')}`);
    }

    if (sub === 'solve') {
      const game = ctx.db.get(`cw_${sender}`);
      if (!game) return reply('Start with .crossword start');
      
      const answer = args.slice(1).join('').toUpperCase();
      
      if (answer === game.word) {
        ctx.db.pull(`cw_${sender}`);
        return reply('🏆 *Correct!*');
      } else {
        return reply('❌ *Wrong!*');
      }
    }

    reply('*Crossword*\n.crossword start\n.crossword guess <letter>\n.crossword solve <word>');
  }
};

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
  aliases: ["cw", "g4crossword"],
  category: 'games',
  description: "Game: crossword",
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
