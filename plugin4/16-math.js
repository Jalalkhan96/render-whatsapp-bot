// Auto-adapted from supplied 50-game plugin: 16-math.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["math", "mathgame", "calculate"];
const SOURCE_NAME = "math";
const PRIMARY = "mathgame";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'math',
  category: 'games',
  description: 'Math challenge',
  commands: ['math', 'mathgame', 'calculate'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const a = Math.floor(Math.random() * 50) + 1;
      const b = Math.floor(Math.random() * 50) + 1;
      const ops = ['+', '-', '*', '/'];
      const op = ops[Math.floor(Math.random() * ops.length)];
      
      let answer;
      if (op === '+') answer = a + b;
      else if (op === '-') answer = a - b;
      else if (op === '*') answer = a * b;
      else answer = Math.round((a / b) * 100) / 100;
      
      games.set(sender, { a, b, op, answer });
      return reply(`🧮 *Math Challenge*\n\n${a} ${op} ${b} = ?\n\nUse .math answer <number>`);
    }

    if (sub === 'answer') {
      const game = games.get(sender);
      if (!game) return reply('Start with .math start');
      
      const userAnswer = parseFloat(args[1]);
      games.delete(sender);
      
      if (Math.abs(userAnswer - game.answer) < 0.01) {
        return reply(`✅ *Correct!* ${game.a} ${game.op} ${game.b} = ${game.answer}`);
      } else {
        return reply(`❌ *Wrong!* Correct answer: ${game.answer}`);
      }
    }

    reply('*Math Challenge*\n.math start\n.math answer <number>');
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
  aliases: ["calculate", "g4math"],
  category: 'games',
  description: "Game: math",
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
