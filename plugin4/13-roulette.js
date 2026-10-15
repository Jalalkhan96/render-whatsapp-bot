// Auto-adapted from supplied 50-game plugin: 13-roulette.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["roulette", "rl", "roul"];
const SOURCE_NAME = "roulette";
const PRIMARY = "roulette";
const ORIGINAL = (() => {
const GAME = {
  name: 'roulette',
  category: 'games',
  description: 'Play Roulette',
  commands: ['roulette', 'rl', 'roul'],
  async handler(ctx) {
    const { args, reply } = ctx;
    const bet = args[0]?.toLowerCase();
    
    if (!bet) {
      return reply('*Roulette*\n\nBet on: red, black, or number (0-36)\n\nUsage: .roulette red or .roulette 17');
    }
    
    const num = Math.floor(Math.random() * 37);
    const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    const color = num === 0 ? 'green' : redNumbers.includes(num) ? 'red' : 'black';
    
    let win = false;
    if (bet === 'red' && color === 'red') win = true;
    else if (bet === 'black' && color === 'black') win = true;
    else if (parseInt(bet) === num) win = true;
    
    const result = win ? '🏆 You win!' : '😢 You lose!';
    const emoji = color === 'red' ? '🔴' : color === 'black' ? '⚫' : '🟢';
    
    await reply(`🎰 *Roulette*\n\n${emoji} Number: *${num}* (${color})\n\n${result}`);
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
  aliases: ["rl", "roul", "g4roulette"],
  category: 'games',
  description: "Game: roulette",
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
