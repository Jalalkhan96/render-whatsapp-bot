// Auto-adapted from supplied 50-game plugin: 27-pet.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["pet", "tamagotchi"];
const SOURCE_NAME = "pet";
const PRIMARY = "pet";
const ORIGINAL = (() => {
const pets = new Map();

const GAME = {
  name: 'pet',
  category: 'games',
  description: 'Virtual pet',
  commands: ['pet', 'tamagotchi'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'adopt') {
      const name = args[1] || 'Fluffy';
      pets.set(sender, { name, hunger: 50, happiness: 50, health: 100, age: 0 });
      return reply(`🐾 *You adopted ${name}!*\n\n.pet feed\n.pet play\n.pet status`);
    }

    const pet = pets.get(sender);
    if (!pet) return reply('Adopt a pet with .pet adopt <name>');

    if (sub === 'feed') {
      pet.hunger = Math.max(0, pet.hunger - 30);
      pet.health = Math.min(100, pet.health + 5);
      return reply(`🍖 *${pet.name}* ate!\n\nHunger: ${pet.hunger}%\nHealth: ${pet.health}%`);
    }

    if (sub === 'play') {
      pet.happiness = Math.min(100, pet.happiness + 30);
      pet.hunger = Math.min(100, pet.hunger + 15);
      return reply(`🎾 *${pet.name}* played!\n\nHappiness: ${pet.happiness}%\nHunger: ${pet.hunger}%`);
    }

    if (sub === 'status') {
      return reply(`🐾 *${pet.name}*\n\nHunger: ${pet.hunger}%\nHappiness: ${pet.happiness}%\nHealth: ${pet.health}%\nAge: ${pet.age} days`);
    }

    reply('*Pet*\n.pet adopt <name>\n.pet feed\n.pet play\n.pet status');
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
  aliases: ["tamagotchi", "g4pet"],
  category: 'games',
  description: "Game: pet",
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
