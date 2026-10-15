// Auto-adapted from supplied 50-game plugin: 28-mine.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["mine", "dig", "mining"];
const SOURCE_NAME = "Coal";
const PRIMARY = "mine";
const ORIGINAL = (() => {
const ores = [
  { name: 'Coal', value: 10, chance: 0.5 },
  { name: 'Iron', value: 25, chance: 0.3 },
  { name: 'Gold', value: 50, chance: 0.15 },
  { name: 'Diamond', value: 150, chance: 0.05 }
];

const players = new Map();

const GAME = {
  name: 'mine',
  category: 'games',
  description: 'Mining game',
  commands: ['mine', 'dig', 'mining'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      players.set(sender, { coins: 0, ores: {} });
      return reply('⛏️ *Mining Started!*\n\n.mine dig - Mine for ore');
    }

    const p = players.get(sender);
    if (!p) return reply('Start with .mine start');

    if (sub === 'dig') {
      let roll = Math.random(), cum = 0, found = null;
      for (const ore of ores) {
        cum += ore.chance;
        if (roll < cum) {
          found = ore;
          break;
        }
      }
      
      if (!found) return reply('🪨 Just rocks... Try again!');
      
      p.ores[found.name] = (p.ores[found.name] || 0) + 1;
      p.coins += found.value;
      return reply(`⛏️ You found *${found.name}*! (+${found.value} coins)\n\nTotal coins: ${p.coins}`);
    }

    if (sub === 'inventory') {
      const ores_list = Object.entries(p.ores).map(([k, v]) => `• ${k}: ${v}`).join('\n') || 'Empty';
      return reply(`📦 *Inventory*\n${ores_list}\n\nCoins: ${p.coins}`);
    }

    reply('*Mining*\n.mine start\n.mine dig\n.mine inventory');
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
  aliases: ["dig", "mining", "g4coal", "g4mine"],
  category: 'games',
  description: "Game: Coal",
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
