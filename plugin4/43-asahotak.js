// Auto-adapted from supplied 50-game plugin: 43-asahotak.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["asahotak", "ao", "brainteaser"];
const SOURCE_NAME = "asahotak";
const PRIMARY = "asahotak";
const ORIGINAL = (() => {
const questions = [
  { q: 'What has a head, a tail, but no body?', a: 'coin' },
  { q: 'What gets wetter the more it dries?', a: 'towel' },
  { q: 'What has a face and two hands but no arms or legs?', a: 'clock' },
  { q: 'I am taken from a mine and shut up in a wooden case. What am I?', a: 'pencil' },
  { q: 'What is always coming but never arrives?', a: 'tomorrow' },
  { q: 'What can be cracked, made, told, and played?', a: 'joke' }
];

const games = new Map();

const GAME = {
  name: 'asahotak',
  category: 'games',
  description: 'Brain teasers',
  commands: ['asahotak', 'ao', 'brainteaser'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const q = questions[Math.floor(Math.random() * questions.length)];
      ctx.db.set(`ao_${sender}`, q);
      return reply(`🧠 *Brain Teaser*\n\n${q.q}\n\n.asahotak answer <text>`);
    }

    if (sub === 'answer') {
      const q = ctx.db.get(`ao_${sender}`);
      if (!q) return reply('Start with .asahotak start');
      
      ctx.db.pull(`ao_${sender}`);
      const ans = args.slice(1).join(' ').toLowerCase();
      
      if (ans.includes(q.a)) {
        return reply(`✅ *Correct!* Answer: ${q.a}`);
      } else {
        return reply(`❌ *Wrong!* Answer: ${q.a}`);
      }
    }

    reply('*Asah Otak*\n.asahotak start\n.asahotak answer <text>');
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
  aliases: ["ao", "g4asahotak"],
  category: 'games',
  description: "Game: asahotak",
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
