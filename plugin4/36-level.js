// Auto-adapted from supplied 50-game plugin: 36-level.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["level", "rank", "xp"];
const SOURCE_NAME = "level";
const PRIMARY = "level";
const ORIGINAL = (() => {
const users = new Map();

const GAME = {
  name: 'level',
  category: 'games',
  description: 'XP and leveling system',
  commands: ['level', 'rank', 'xp'],
  async handler(ctx) {
    const { sender, reply } = ctx;

    let u = users.get(sender);
    if (!u) {
      u = { xp: 0, level: 1 };
      users.set(sender, u);
    }

    // Gain random XP when checking level
    u.xp += Math.floor(Math.random() * 10) + 5;

    const xpNeeded = u.level * 100;
    if (u.xp >= xpNeeded) {
      u.level++;
      u.xp = 0;
      return reply(`📊 *Level Up!* You reached level ${u.level}!`);
    }

    await reply(`📊 @${sender.split('@')[0]}\n\n⭐ Level: ${u.level}\n📈 XP: ${u.xp}/${xpNeeded}`, { mentions: [sender] });
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
  aliases: ["xp", "g4level"],
  category: 'games',
  description: "Game: level",
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
