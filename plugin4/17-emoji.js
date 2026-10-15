// Auto-adapted from supplied 50-game plugin: 17-emoji.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["emoji", "guessemoji", "emo"];
const SOURCE_NAME = "emoji";
const PRIMARY = "emoji";
const ORIGINAL = (() => {
const riddles = [
  { emoji: '☀️🍎', answer: 'apple' },
  { emoji: '🐱🐟', answer: 'catfish' },
  { emoji: '🌧️🐕🐈', answer: 'raining' },
  { emoji: '❤️📖', answer: 'love' },
  { emoji: '🔥🐉', answer: 'dragon' },
  { emoji: '🚗💨', answer: 'fast' },
  { emoji: '🌙⭐', answer: 'night' },
  { emoji: '🎂🍰', answer: 'birthday' }
];

const games = new Map();

const GAME = {
  name: 'emoji',
  category: 'games',
  description: 'Guess emoji phrase',
  commands: ['emoji', 'guessemoji', 'emo'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const r = riddles[Math.floor(Math.random() * riddles.length)];
      games.set(`emoji-${jid}`, r);
      return reply(`🔍 *Guess the Phrase*\n\n${r.emoji}\n\nUse .emoji answer <text>`);
    }

    if (sub === 'answer') {
      const r = games.get(`emoji-${jid}`);
      if (!r) return reply('Start with .emoji start');
      
      games.delete(`emoji-${jid}`);
      const ans = args.slice(1).join(' ').toLowerCase();
      
      if (ans.includes(r.answer)) {
        return reply(`✅ *Correct!* Answer: ${r.answer}`);
      } else {
        return reply(`❌ *Wrong!* Answer: ${r.answer}`);
      }
    }

    reply('*Guess Emoji*\n.emoji start\n.emoji answer <text>');
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
  aliases: ["guessemoji", "emo", "g4emoji"],
  category: 'games',
  description: "Game: emoji",
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
