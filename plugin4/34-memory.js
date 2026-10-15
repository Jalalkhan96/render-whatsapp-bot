// Auto-adapted from supplied 50-game plugin: 34-memory.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["memory", "mem", "match"];
const SOURCE_NAME = "memory";
const PRIMARY = "memory";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'memory',
  category: 'games',
  description: 'Memory matching game',
  commands: ['memory', 'mem', 'match'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const emojis = ['🍎', '🍌', '🍇', '🍊', '🍓', '🍒', '🥝', '🍑'];
      const deck = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
      games.set(sender, { deck, revealed: [], matched: [], flips: 0 });
      
      const display = deck.map((_, i) => `${i + 1}`).join(' ');
      return reply(`🧠 *Memory Game*\n\n${display}\n\n.memory flip <pos> (1-16)`);
    }

    const game = games.get(sender);
    if (!game) return reply('Start with .memory start');

    if (sub === 'flip') {
      const pos = parseInt(args[1]) - 1;
      if (isNaN(pos) || pos < 0 || pos > 15) return reply('Position 1-16');
      if (game.matched.includes(pos) || game.revealed.includes(pos)) return reply('Already revealed!');
      
      game.revealed.push(pos);
      game.flips++;
      
      if (game.revealed.length === 2) {
        const [a, b] = game.revealed;
        if (game.deck[a] === game.deck[b]) {
          game.matched.push(a, b);
          game.revealed = [];
          
          if (game.matched.length === 16) {
            games.delete(sender);
            return reply(`🏆 *All matched in ${game.flips} flips!*`);
          }
          return reply(`✅ *Match!*`);
        }
        
        setTimeout(() => { game.revealed = []; }, 1000);
        return reply(`❌ *No match*`);
      }
      
      const display = game.deck.map((e, i) => game.matched.includes(i) || game.revealed.includes(i) ? e : '🟦').join(' ');
      return reply(`🧠 ${display}`);
    }

    reply('*Memory*\n.memory start\n.memory flip <1-16>');
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
  aliases: ["mem", "match", "g4memory"],
  category: 'games',
  description: "Game: memory",
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
