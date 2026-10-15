// Auto-adapted from supplied 50-game plugin: 40-poker.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["poker", "planning", "estimate"];
const SOURCE_NAME = "poker";
const PRIMARY = "poker";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'poker',
  category: 'games',
  description: 'Planning poker',
  commands: ['poker', 'planning', 'estimate'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      games.set(`poker-${jid}`, { votes: {}, started: true });
      return reply('🃏 *Planning Poker*\n\nEstimate with: 1, 2, 3, 5, 8, 13\n\n.poker vote <number>');
    }

    if (sub === 'vote') {
      const game = games.get(`poker-${jid}`);
      if (!game) return reply('Start with .poker start');
      
      const vote = args[1];
      if (!['1', '2', '3', '5', '8', '13'].includes(vote)) return reply('Vote: 1, 2, 3, 5, 8, or 13');
      
      game.votes[sender] = vote;
      return reply(`✅ @${sender.split('@')[0]} voted!`, { mentions: [sender] });
    }

    if (sub === 'reveal') {
      const game = games.get(`poker-${jid}`);
      if (!game) return reply('No game!');
      
      const votes = Object.entries(game.votes)
        .map(([u, v]) => `@${u.split('@')[0]}: ${v}`)
        .join('\n');
      
      return reply(`📊 *Votes*\n${votes || 'No votes yet'}`);
    }

    if (sub === 'end') {
      games.delete(`poker-${jid}`);
      return reply('Game ended.');
    }

    reply('*Planning Poker*\n.poker start\n.poker vote <1|2|3|5|8|13>\n.poker reveal\n.poker end');
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
  aliases: ["planning", "estimate", "g4poker"],
  category: 'games',
  description: "Game: poker",
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
