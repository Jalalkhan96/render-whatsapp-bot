// Auto-adapted from supplied 50-game plugin: 25-pokemon.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["pokemon", "pkmn", "poke"];
const SOURCE_NAME = "Pikachu";
const PRIMARY = "pkmn";
const ORIGINAL = (() => {
const pokemons = [
  { name: 'Pikachu', type: 'Electric', hp: 35, atk: 55 },
  { name: 'Charizard', type: 'Fire', hp: 78, atk: 84 },
  { name: 'Blastoise', type: 'Water', hp: 79, atk: 83 },
  { name: 'Venusaur', type: 'Grass', hp: 80, atk: 82 },
  { name: 'Dragonite', type: 'Dragon', hp: 91, atk: 134 }
];

const players = new Map();

const GAME = {
  name: 'pokemon',
  category: 'games',
  description: 'Pokemon RPG',
  commands: ['pokemon', 'pkmn', 'poke'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      players.set(sender, { party: [pokemons[0]], level: 1, xp: 0, coins: 100 });
      return reply(`🔴 *Pokemon Started!*\n\nYou got Pikachu!\n\n.pokemon catch - Find Pokemon\n.pokemon party - See team\n.pokemon battle - Battle`);
    }

    const p = players.get(sender);
    if (!p) return reply('Start with .pokemon start');

    if (sub === 'catch') {
      if (Math.random() > 0.4) return reply('😢 No Pokemon appeared. Try again!');
      const pokemon = pokemons[Math.floor(Math.random() * pokemons.length)];
      p.party.push(pokemon);
      return reply(`🎉 You caught *${pokemon.name}* (${pokemon.type})!`);
    }

    if (sub === 'party') {
      const party = p.party.map(pk => `• ${pk.name} (${pk.type}) HP:${pk.hp} ATK:${pk.atk}`).join('\n');
      return reply(`🎒 *Your Party*\n${party}\n\nLevel: ${p.level}\nCoins: ${p.coins}`);
    }

    if (sub === 'battle') {
      if (p.party.length < 2) return reply('Need at least 2 Pokemon!');
      const [a, b] = [p.party[0], p.party[1]];
      const winner = (a.atk + Math.random() * 20) > (b.atk + Math.random() * 20) ? a.name : b.name;
      return reply(`⚔️ *${a.name}* vs *${b.name}*\n\n🏆 *${winner}* wins!`);
    }

    reply('*Pokemon*\n.pokemon start\n.pokemon catch\n.pokemon party\n.pokemon battle');
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
  aliases: ["g4pikachu", "g4pokemon"],
  category: 'games',
  description: "Game: Pikachu",
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
