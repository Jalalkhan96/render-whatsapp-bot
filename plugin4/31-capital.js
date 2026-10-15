// Auto-adapted from supplied 50-game plugin: 31-capital.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["capital", "ccf", "capitals"];
const SOURCE_NAME = "capital";
const PRIMARY = "capital";
const ORIGINAL = (() => {
const capitals = [
  { country: 'France', capital: 'Paris' },
  { country: 'Japan', capital: 'Tokyo' },
  { country: 'Brazil', capital: 'Brasilia' },
  { country: 'Australia', capital: 'Canberra' },
  { country: 'Canada', capital: 'Ottawa' },
  { country: 'Egypt', capital: 'Cairo' },
  { country: 'Germany', capital: 'Berlin' },
  { country: 'Italy', capital: 'Rome' },
  { country: 'Spain', capital: 'Madrid' },
  { country: 'India', capital: 'New Delhi' }
];

const games = new Map();

const GAME = {
  name: 'capital',
  category: 'games',
  description: 'Guess the capital',
  commands: ['capital', 'ccf', 'capitals'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const item = capitals[Math.floor(Math.random() * capitals.length)];
      games.set(`cap-${jid}`, item);
      return reply(`🌍 *What is the capital of ${item.country}?*\n\n.capital answer <city>`);
    }

    if (sub === 'answer') {
      const item = games.get(`cap-${jid}`);
      if (!item) return reply('Start with .capital start');
      
      games.delete(`cap-${jid}`);
      const ans = args.slice(1).join(' ').toLowerCase();
      
      if (ans === item.capital.toLowerCase()) {
        return reply(`✅ *Correct!* Capital: *${item.capital}*`);
      } else {
        return reply(`❌ *Wrong!* Capital: *${item.capital}*`);
      }
    }

    reply('*Capital Guessing*\n.capital start\n.capital answer <city>');
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
  aliases: ["ccf", "capitals", "g4capital"],
  category: 'games',
  description: "Game: capital",
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
