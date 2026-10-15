// Auto-adapted from supplied 50-game plugin: 37-gkquiz.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["gkquiz", "gk", "knowledge"];
const SOURCE_NAME = "gkquiz";
const PRIMARY = "gkquiz";
const ORIGINAL = (() => {
const questions = [
  { q: 'What is the largest planet?', a: 'Jupiter' },
  { q: 'How many continents are there?', a: '7' },
  { q: 'What is the chemical formula for salt?', a: 'NaCl' },
  { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci' },
  { q: 'What is the tallest mountain?', a: 'Mount Everest' },
  { q: 'What is the largest ocean?', a: 'Pacific' },
  { q: 'What is the capital of France?', a: 'Paris' },
  { q: 'How many bones do humans have?', a: '206' }
];

const games = new Map();

const GAME = {
  name: 'gkquiz',
  category: 'games',
  description: 'General knowledge quiz',
  commands: ['gkquiz', 'gk', 'knowledge'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const q = questions[Math.floor(Math.random() * questions.length)];
      games.set(`gk-${jid}`, q);
      return reply(`📚 *General Knowledge*\n\n${q.q}\n\n.gk answer <text>`);
    }

    if (sub === 'answer') {
      const q = games.get(`gk-${jid}`);
      if (!q) return reply('Start with .gk start');
      
      games.delete(`gk-${jid}`);
      const userAns = args.slice(1).join(' ').toLowerCase();
      
      if (userAns.includes(q.a.toLowerCase())) {
        return reply(`✅ *Correct!* ${q.a}`);
      } else {
        return reply(`❌ *Wrong!* Answer: ${q.a}`);
      }
    }

    reply('*General Knowledge Quiz*\n.gk start\n.gk answer <text>');
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
  aliases: ["gk", "knowledge", "g4gkquiz"],
  category: 'games',
  description: "Game: gkquiz",
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
