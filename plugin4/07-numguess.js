// Auto-adapted from supplied 50-game plugin: 07-numbguess.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["ngg", "guess", "numguess"];
const SOURCE_NAME = "numguess";
const PRIMARY = "ngg";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'numguess',
  category: 'games',
  description: 'Guess the number',
  commands: ['ngg', 'guess', 'numguess'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const num = Math.floor(Math.random() * 100) + 1;
      games.set(sender, { num, tries: 0 });
      return reply('🔢 *Number Guessing*\n\nI picked a number 1-100. Guess it!\n\nUse .ngg guess <number>');
    }

    if (sub === 'guess') {
      const game = games.get(sender);
      if (!game) return reply('Start with .ngg start');
      
      const guess = parseInt(args[1]);
      if (isNaN(guess) || guess < 1 || guess > 100) return reply('Guess a number between 1-100');
      
      game.tries++;
      
      if (guess === game.num) {
        games.delete(sender);
        return reply(`🏆 *Correct!* You got it in ${game.tries} tries! Number was ${game.num}`);
      }
      
      const hint = guess < game.num ? '📈 Higher!' : '📉 Lower!';
      return reply(`${hint}\nTry ${game.tries}\n\nUse .ngg guess <number>`);
    }

    reply('*Number Guessing*\n.ngg start\n.ngg guess <number>');
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
  aliases: ["guess", "numguess", "g4numguess", "g4ngg"],
  category: 'games',
  description: "Game: numguess",
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
