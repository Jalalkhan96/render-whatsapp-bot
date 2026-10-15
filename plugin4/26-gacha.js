// Auto-adapted from supplied 50-game plugin: 26-gacha.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["gacha", "pull", "draw"];
const SOURCE_NAME = "gacha";
const PRIMARY = "gacha";
const ORIGINAL = (() => {
const rarities = [
  '⭐ 1★ Common',
  '⭐⭐ 2★ Rare',
  '⭐⭐⭐ 3★ Super Rare',
  '⭐⭐⭐⭐ 4★ Legendary',
  '⭐⭐⭐⭐⭐ 5★ Mythic'
];

const characters = [
  'Kirito', 'Asuna', 'Saber', 'Emilia', 'Rem',
  'Aqua', 'Megumin', 'Darkness', 'Chika', 'Hatsune Miku'
];

const GAME = {
  name: 'gacha',
  category: 'games',
  description: 'Gacha character pull',
  commands: ['gacha', 'pull', 'draw'],
  async handler(ctx) {
    const { reply } = ctx;

    const roll = Math.random();
    let rarity = 0;
    if (roll < 0.5) rarity = 0;
    else if (roll < 0.75) rarity = 1;
    else if (roll < 0.9) rarity = 2;
    else if (roll < 0.98) rarity = 3;
    else rarity = 4;

    const character = characters[Math.floor(Math.random() * characters.length)];

    await reply(`🎴 *Gacha Pull*\n\n${rarities[rarity]}\n\n*${character}*\n\n${rarity >= 3 ? '🎉 Congratulations!' : ''}`);
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
  aliases: ["g4gacha"],
  category: 'games',
  description: "Game: gacha",
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
