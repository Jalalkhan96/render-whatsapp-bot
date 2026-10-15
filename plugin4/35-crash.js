// Auto-adapted from supplied 50-game plugin: 35-crash.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["crash"];
const SOURCE_NAME = "crash";
const PRIMARY = "crash";
const ORIGINAL = (() => {
const GAME = {
  name: 'crash',
  category: 'games',
  description: 'Crash gambling game',
  commands: ['crash'],
  async handler(ctx) {
    const { reply } = ctx;

    let multiplier = 1.0;
    while (Math.random() > 0.08) {
      multiplier += 0.1;
    }
    multiplier = Math.round(multiplier * 100) / 100;

    const result = multiplier > 1.5 
      ? `🚀 *Crash at ${multiplier}x!*\n\n🏆 Great multiplier!`
      : `🚀 *Crash at ${multiplier}x!*\n\n😢 Crashed low!`;

    await reply(result);
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
  aliases: ["g4crash"],
  category: 'games',
  description: "Game: crash",
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
