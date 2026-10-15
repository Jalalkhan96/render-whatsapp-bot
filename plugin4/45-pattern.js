// Auto-adapted from supplied 50-game plugin: 45-pattern.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["pattern", "pat", "patternlock"];
const SOURCE_NAME = "pattern";
const PRIMARY = "pattern";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'pattern',
  category: 'games',
  description: 'Pattern memory game',
  commands: ['pattern', 'pat', 'patternlock'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const pattern = Array.from({ length: 4 }, () => Math.floor(Math.random() * 9) + 1);
      games.set(sender, { pattern, score: 0 });
      return reply(`🔐 *Pattern Game*\n\nRemember: ${pattern.join(' - ')}\n\n.pattern repeat <numbers>`);
    }

    if (sub === 'repeat') {
      const game = games.get(sender);
      if (!game) return reply('Start with .pattern start');
      
      const input = args.slice(1).map(Number);
      if (JSON.stringify(input) === JSON.stringify(game.pattern)) {
        const newPattern = Array.from({ length: 5 }, () => Math.floor(Math.random() * 9) + 1);
        game.pattern = newPattern;
        game.score++;
        return reply(`✅ *Correct!*\n\nNew pattern: ${newPattern.join(' - ')}\n\nScore: ${game.score}`);
      } else {
        games.delete(sender);
        return reply(`❌ *Wrong!* Final Score: ${game.score}`);
      }
    }

    reply('*Pattern Game*\n.pattern start\n.pattern repeat <numbers>');
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
  aliases: ["patternlock", "g4pattern"],
  category: 'games',
  description: "Game: pattern",
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
