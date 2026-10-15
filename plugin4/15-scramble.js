// Auto-adapted from supplied 50-game plugin: 15-scramble.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["scramble", "scr", "unscramble"];
const SOURCE_NAME = "scramble";
const PRIMARY = "scramble";
const ORIGINAL = (() => {
const words = ['WHATSAPP', 'BAILEYS', 'JAVASCRIPT', 'PROGRAMMING', 'DEVELOPER', 'MESSAGE', 'DATABASE', 'FUNCTION', 'ALGORITHM', 'COMPUTER'];
const games = new Map();

const GAME = {
  name: 'scramble',
  category: 'games',
  description: 'Unscramble words',
  commands: ['scramble', 'scr', 'unscramble'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const word = words[Math.floor(Math.random() * words.length)];
      const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
      games.set(sender, { word, scrambled });
      return reply(`🔀 *Unscramble*\n\n*${scrambled}*\n\nUse .scramble answer <word>`);
    }

    if (sub === 'answer') {
      const game = games.get(sender);
      if (!game) return reply('Start with .scramble start');
      
      const answer = args[1]?.toUpperCase();
      games.delete(sender);
      
      if (answer === game.word) {
        return reply(`🏆 *Correct!* Word was: *${game.word}*`);
      } else {
        return reply(`❌ *Wrong!* Word was: *${game.word}*`);
      }
    }

    reply('*Scramble*\n.scramble start\n.scramble answer <word>');
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
  aliases: ["scr", "unscramble", "g4scramble"],
  category: 'games',
  description: "Game: scramble",
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
