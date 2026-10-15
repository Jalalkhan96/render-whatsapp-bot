// Auto-adapted from supplied 50-game plugin: 12-slots.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["slots", "slot", "slotmachine"];
const SOURCE_NAME = "slots";
const PRIMARY = "slots";
const ORIGINAL = (() => {
const symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣'];

const GAME = {
  name: 'slots',
  category: 'games',
  description: 'Play slot machine',
  commands: ['slots', 'slot', 'slotmachine'],
  async handler(ctx) {
    const { reply } = ctx;
    
    const spin = () => symbols[Math.floor(Math.random() * symbols.length)];
    const reels = [spin(), spin(), spin()];
    const win = reels[0] === reels[1] && reels[1] === reels[2];
    
    const message = win 
      ? `🎰 [ ${reels.join(' | ')} ]\n\n🏆 *JACKPOT!* You win!`
      : `🎰 [ ${reels.join(' | ')} ]\n\n😢 No match. Try again!`;
    
    await reply(message);
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
  aliases: ["slot", "slotmachine", "g4slots"],
  category: 'games',
  description: "Game: slots",
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
