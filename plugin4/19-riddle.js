// Auto-adapted from supplied 50-game plugin: 19-riddle.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["riddle", "rid", "riddles"];
const SOURCE_NAME = "riddle";
const PRIMARY = "rid";
const ORIGINAL = (() => {
const riddles = [
  { q: 'I speak without a mouth and hear without ears. What am I?', a: 'echo' },
  { q: 'The more you take, the more you leave behind. What am I?', a: 'footsteps' },
  { q: 'I have keys but no locks. What am I?', a: 'piano' },
  { q: 'What has to be broken before you can use it?', a: 'egg' },
  { q: 'I am taken from a mine and shut up in a wooden case, from which I am never released, yet I am used by almost everyone. What am I?', a: 'pencil' },
  { q: 'What has a face and two hands but no arms or legs?', a: 'clock' },
  { q: 'What gets wetter the more it dries?', a: 'towel' },
  { q: 'What has a head and a tail but no body?', a: 'coin' }
];

const games = new Map();

const GAME = {
  name: 'riddle',
  category: 'games',
  description: 'Solve riddles',
  commands: ['riddle', 'rid', 'riddles'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const r = riddles[Math.floor(Math.random() * riddles.length)];
      games.set(sender, r);
      return reply(`🧩 *Riddle*\n\n${r.q}\n\nUse .riddle answer <answer>`);
    }

    if (sub === 'answer') {
      const r = games.get(sender);
      if (!r) return reply('Start with .riddle start');
      
      games.delete(sender);
      const ans = args.slice(1).join(' ').toLowerCase();
      
      if (ans.includes(r.a)) {
        return reply(`🏆 *Correct!* Answer: ${r.a}`);
      } else {
        return reply(`❌ *Wrong!* Answer: ${r.a}`);
      }
    }

    reply('*Riddle*\n.riddle start\n.riddle answer <answer>');
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
  aliases: ["riddles", "g4riddle"],
  category: 'games',
  description: "Game: riddle",
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
