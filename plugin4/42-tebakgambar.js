// Auto-adapted from supplied 50-game plugin: 42-tebakgambar.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["tebakgambar", "tg", "guessimg"];
const SOURCE_NAME = "tebakgambar";
const PRIMARY = "tebakgambar";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'tebakgambar',
  category: 'games',
  description: 'Guess the image',
  commands: ['tebakgambar', 'tg', 'guessimg'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const images = [
        { answer: 'cat' },
        { answer: 'dog' },
        { answer: 'bird' },
        { answer: 'fish' },
        { answer: 'tree' }
      ];
      
      const img = images[Math.floor(Math.random() * images.length)];
      games.set(`tg-${jid}`, img);
      return reply(`🖼️ *Tebak Gambar*\n\nGuess what this image is!\n\n.tebakgambar answer <text>`);
    }

    if (sub === 'answer') {
      const img = games.get(`tg-${jid}`);
      if (!img) return reply('Start with .tebakgambar start');
      
      games.delete(`tg-${jid}`);
      const ans = args.slice(1).join(' ').toLowerCase();
      
      if (ans.includes(img.answer)) {
        return reply(`✅ *Correct!* It was: ${img.answer}`);
      } else {
        return reply(`❌ *Wrong!* Answer: ${img.answer}`);
      }
    }

    reply('*Tebak Gambar*\n.tebakgambar start\n.tebakgambar answer <text>');
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
  aliases: ["tg", "guessimg", "g4tebakgambar"],
  category: 'games',
  description: "Game: tebakgambar",
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
