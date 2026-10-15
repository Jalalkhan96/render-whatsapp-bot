// Auto-adapted from supplied 50-game plugin: 18-bullscows.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["bullscows", "bc", "bac"];
const SOURCE_NAME = "bullscows";
const PRIMARY = "bullscows";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'bullscows',
  category: 'games',
  description: 'Bulls and Cows code game',
  commands: ['bullscows', 'bc', 'bac'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const secret = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('');
      games.set(sender, { secret, tries: 0 });
      return reply(`🐂 *Bulls & Cows*\n\nI picked a 4-digit number.\nGuess it!\n\n🟢 Bull = correct digit in correct position\n🟡 Cow = correct digit in wrong position\n\nUse .bc guess <4 digits>`);
    }

    if (sub === 'guess') {
      const game = games.get(sender);
      if (!game) return reply('Start with .bc start');
      
      const guess = args[1];
      if (!guess || guess.length !== 4 || isNaN(guess)) return reply('Guess must be 4 digits');
      
      game.tries++;
      let bulls = 0, cows = 0;
      
      for (let i = 0; i < 4; i++) {
        if (guess[i] === game.secret[i]) {
          bulls++;
        } else if (game.secret.includes(guess[i])) {
          cows++;
        }
      }
      
      if (bulls === 4) {
        games.delete(sender);
        return reply(`🏆 *Correct!* ${game.secret} in ${game.tries} tries!`);
      }
      
      return reply(`🐂 Bulls: ${bulls} | 🐄 Cows: ${cows}\nTry ${game.tries}`);
    }

    reply('*Bulls & Cows*\n.bc start\n.bc guess <4 digits>');
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
  aliases: ["bc", "bac", "g4bullscows"],
  category: 'games',
  description: "Game: bullscows",
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
