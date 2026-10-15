// Auto-adapted from supplied 50-game plugin: 04-dice.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["dice", "roll"];
const SOURCE_NAME = "dice";
const PRIMARY = "roll";
const ORIGINAL = (() => {
const GAME = {
  name: 'dice',
  category: 'games',
  description: 'Roll dice',
  commands: ['dice', 'roll'],
  async handler(ctx) {
    const { args, reply } = ctx;
    const sides = parseInt(args[0]) || 6;
    
    if (sides < 2 || sides > 1000) return reply('Sides must be 2-1000');
    
    const result = Math.floor(Math.random() * sides) + 1;
    await reply(`🎲 You rolled: *${result}* (d${sides})`);
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
  aliases: ["g4dice"],
  category: 'games',
  description: "Game: dice",
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
