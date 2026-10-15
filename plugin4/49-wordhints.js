// Auto-adapted from supplied 50-game plugin: 49-wordhints.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["wordhints", "wh", "wordgame"];
const SOURCE_NAME = "wordhints";
const PRIMARY = "wordhints";
const ORIGINAL = (() => {
const words = [
  { word: 'PROGRAMMING', hint: 'Writing computer code', hint2: 'Starts with P' },
  { word: 'ADVENTURE', hint: 'An exciting journey', hint2: 'Starts with A' },
  { word: 'BEAUTIFUL', hint: 'Very attractive', hint2: 'Starts with B' },
  { word: 'DATABASE', hint: 'Organized data storage', hint2: 'Starts with D' },
  { word: 'ELEPHANT', hint: 'A large animal', hint2: 'Starts with E' }
];

const games = new Map();

const GAME = {
  name: 'wordhints',
  category: 'games',
  description: 'Word guessing with hints',
  commands: ['wordhints', 'wh', 'wordgame'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const w = words[Math.floor(Math.random() * words.length)];
      games.set(sender, { word: w.word, hints_used: 0, hint1: w.hint, hint2: w.hint2 });
      const display = w.word.split('').map((_, i) => i === 0 ? w.word[0] : '_').join(' ');
      return reply(`🔤 *Word Guessing*\n\n${display}\n\n.wordhints hint for help\n.wordhints guess <word>`);
    }

    if (sub === 'hint') {
      const game = games.get(sender);
      if (!game) return reply('Start with .wordhints start');
      
      game.hints_used++;
      if (game.hints_used === 1) return reply(`💡 Hint 1: ${game.hint1}`);
      if (game.hints_used === 2) return reply(`💡 Hint 2: ${game.hint2}`);
      return reply('No more hints!');
    }

    if (sub === 'guess') {
      const game = games.get(sender);
      if (!game) return reply('Start with .wordhints start');
      
      games.delete(sender);
      const guess = args.slice(1).join('').toUpperCase();
      
      if (guess === game.word) {
        return reply(`🏆 *Correct!* Word: ${game.word}\n\nHints used: ${game.hints_used}`);
      } else {
        return reply(`❌ *Wrong!* Word: ${game.word}`);
      }
    }

    reply('*Word Guessing*\n.wordhints start\n.wordhints hint\n.wordhints guess <word>');
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
  aliases: ["wh", "wordgame", "g4wordhints"],
  category: 'games',
  description: "Game: wordhints",
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
