// Auto-adapted from supplied 50-game plugin: 32-anime.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["anime", "aq", "animequiz"];
const SOURCE_NAME = "anime";
const PRIMARY = "aq";
const ORIGINAL = (() => {
const questions = [
  { q: 'Who is the main protagonist of Naruto?', a: 'Naruto Uzumaki', opts: ['Sasuke', 'Naruto Uzumaki', 'Kakashi', 'Sakura'] },
  { q: 'What is the name of Luffy\'s crew in One Piece?', a: 'Straw Hat', opts: ['Heart', 'Straw Hat', 'Red', 'White Beard'] },
  { q: 'In Attack on Titan, what are the giant humanoids called?', a: 'Titans', opts: ['Giants', 'Titans', 'Colossals', 'Beasts'] },
  { q: 'Who is the protagonist of Death Note?', a: 'Light Yagami', opts: ['L', 'Light Yagami', 'Misa', 'Ryuk'] },
  { q: 'What is the name of the hero society in My Hero Academia?', a: 'U.A.', opts: ['U.A.', 'H.A.', 'M.A.', 'S.A.'] }
];

const games = new Map();

const GAME = {
  name: 'anime',
  category: 'games',
  description: 'Anime quiz',
  commands: ['anime', 'aq', 'animequiz'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const q = questions[Math.floor(Math.random() * questions.length)];
      games.set(`anime-${jid}`, q);
      
      let opts = '';
      q.opts.forEach((opt, i) => opts += `${i + 1}. ${opt}\n`);
      
      return reply(`🎌 *Anime Quiz*\n\n${q.q}\n\n${opts}Use .anime answer <1-4>`);
    }

    if (sub === 'answer') {
      const q = games.get(`anime-${jid}`);
      if (!q) return reply('Start with .anime start');
      
      const idx = parseInt(args[1]) - 1;
      if (isNaN(idx) || idx < 0 || idx > 3) return reply('Answer 1-4');
      
      games.delete(`anime-${jid}`);
      
      if (q.opts[idx] === q.a) {
        return reply(`✅ *Correct!* ${q.a}`);
      } else {
        return reply(`❌ *Wrong!* Answer: ${q.a}`);
      }
    }

    reply('*Anime Quiz*\n.anime start\n.anime answer <1-4>');
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
  aliases: ["animequiz", "g4anime"],
  category: 'games',
  description: "Game: anime",
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
