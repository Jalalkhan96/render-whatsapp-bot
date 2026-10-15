// Auto-adapted from supplied 50-game plugin: 44-sequence.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["sequence", "simon", "seq"];
const SOURCE_NAME = "sequence";
const PRIMARY = "sequence";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'sequence',
  category: 'games',
  description: 'Simon says repeat sequence',
  commands: ['sequence', 'simon', 'seq'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const seq = Array.from({ length: 4 }, () => Math.floor(Math.random() * 4) + 1);
      games.set(sender, { seq, score: 0 });
      return reply(`🔢 *Sequence Memory*\n\nWatch: ${seq.join(' ')}\n\nRepeat with: .sequence say <numbers>`);
    }

    if (sub === 'say') {
      const game = games.get(sender);
      if (!game) return reply('Start with .sequence start');
      
      const input = args.slice(1).map(Number);
      if (JSON.stringify(input) === JSON.stringify(game.seq)) {
        game.seq.push(Math.floor(Math.random() * 4) + 1);
        game.score++;
        return reply(`✅ *Correct!*\n\nNext: ${game.seq.join(' ')}\n\nScore: ${game.score}`);
      } else {
        games.delete(sender);
        return reply(`❌ *Wrong!* Final Score: ${game.score}`);
      }
    }

    reply('*Sequence Memory*\n.sequence start\n.sequence say <numbers>');
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
  aliases: ["simon", "seq", "g4sequence"],
  category: 'games',
  description: "Game: sequence",
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
