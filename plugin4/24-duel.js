// Auto-adapted from supplied 50-game plugin: 24-duel.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["duel", "fight", "battle"];
const SOURCE_NAME = "duel";
const PRIMARY = "duel";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'duel',
  category: 'games',
  description: '1v1 battle',
  commands: ['duel', 'fight', 'battle'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'challenge') {
      const gameId = `duel-${jid}-${Date.now()}`;
      games.set(gameId, { p1: sender, p2: null, hp1: 100, hp2: 100, turn: sender });
      return reply(`⚔️ *Duel Challenge!*\n\nWaiting for opponent...\n\nUse .duel accept <game id>\n\nGame ID: ${gameId}`);
    }

    if (sub === 'accept') {
      const gameId = args[1];
      const game = games.get(gameId);
      if (!game) return reply('Game not found!');
      if (game.p2) return reply('Game already has 2 players!');
      
      game.p2 = sender;
      return reply(`⚔️ *Duel Started!*\n\n@${game.p1.split('@')[0]} (100 HP) vs @${game.p2.split('@')[0]} (100 HP)\n\nUse .duel attack`, { mentions: [game.p1, game.p2] });
    }

    if (sub === 'attack') {
      const game = [...games.entries()].find(([id, g]) => g.p1 === sender || g.p2 === sender);
      if (!game) return reply('You are not in a duel!');
      
      const [gameId, g] = game;
      if (g.turn !== sender) return reply('Not your turn!');
      
      const damage = Math.floor(Math.random() * 30) + 10;
      const isP1 = g.p1 === sender;
      
      if (isP1) {
        g.hp2 -= damage;
      } else {
        g.hp1 -= damage;
      }
      
      g.turn = isP1 ? g.p2 : g.p1;
      
      if (g.hp1 <= 0 || g.hp2 <= 0) {
        games.delete(gameId);
        const winner = g.hp1 > 0 ? g.p1 : g.p2;
        return reply(`🏆 *@${winner.split('@')[0]} Wins!*\n\n${damage} damage dealt!`, { mentions: [g.p1, g.p2] });
      }
      
      return reply(`⚔️ ${damage} damage!\n\n@${g.p1.split('@')[0]}: ${g.hp1} HP\n@${g.p2.split('@')[0]}: ${g.hp2} HP\n\n@${g.turn.split('@')[0]}'s turn!`, { mentions: [g.p1, g.p2] });
    }

    reply('*Duel*\n.duel challenge\n.duel accept <id>\n.duel attack');
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
  aliases: ["fight", "battle", "g4duel"],
  category: 'games',
  description: "Game: duel",
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
