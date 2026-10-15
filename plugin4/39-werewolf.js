// Auto-adapted from supplied 50-game plugin: 39-werewolf.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["werewolf", "ww", "wolf"];
const SOURCE_NAME = "werewolf";
const PRIMARY = "werewolf";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'werewolf',
  category: 'games',
  description: 'Play Werewolf',
  commands: ['werewolf', 'ww', 'wolf'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      games.set(`ww-${jid}`, { players: [sender], roles: {}, started: false, phase: 'lobby' });
      return reply('🐺 *Werewolf Game*\n\nCreated! Others join with .werewolf join\n\nNeed 5+ players');
    }

    if (sub === 'join') {
      const game = games.get(`ww-${jid}`);
      if (!game) return reply('No lobby!');
      if (game.players.includes(sender)) return reply('Already joined!');
      game.players.push(sender);
      return reply(`✅ Joined! (${game.players.length} players)`);
    }

    if (sub === 'begin') {
      const game = games.get(`ww-${jid}`);
      if (!game || game.players.length < 5) return reply('Need 5+ players!');
      
      const roles = ['Werewolf', 'Werewolf', 'Seer', 'Doctor', 'Villager'];
      while (roles.length < game.players.length) roles.push('Villager');
      roles.sort(() => Math.random() - 0.5);
      
      game.players.forEach((p, i) => game.roles[p] = roles[i]);
      game.started = true;
      game.phase = 'night';
      
      return reply(`🌙 *Night falls!*\n\n${game.players.map(p => `@${p.split('@')[0]}: ${game.roles[p]}`).join('\n')}`, { mentions: game.players });
    }

    if (sub === 'status') {
      const game = games.get(`ww-${jid}`);
      if (!game) return reply('No game!');
      return reply(`🐺 Players: ${game.players.length}\nPhase: ${game.phase}`);
    }

    reply('*Werewolf*\n.werewolf start\n.werewolf join\n.werewolf begin\n.werewolf status');
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
  aliases: ["ww", "wolf", "g4werewolf"],
  category: 'games',
  description: "Game: werewolf",
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
