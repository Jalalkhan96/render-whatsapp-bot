// Auto-adapted from supplied 50-game plugin: 08-trivia.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["trivia", "quiz", "triv"];
const SOURCE_NAME = "trivia";
const PRIMARY = "triv";
const ORIGINAL = (() => {
const questions = [
  { q: 'What is the capital of France?', a: 'Paris', opts: ['London', 'Paris', 'Berlin', 'Madrid'] },
  { q: 'What is 7 x 8?', a: '56', opts: ['48', '54', '56', '64'] },
  { q: 'Who wrote Romeo and Juliet?', a: 'Shakespeare', opts: ['Dickens', 'Shakespeare', 'Tolstoy', 'Hemingway'] },
  { q: 'What planet is known as the Red Planet?', a: 'Mars', opts: ['Venus', 'Mars', 'Jupiter', 'Saturn'] },
  { q: 'What is the largest ocean?', a: 'Pacific', opts: ['Atlantic', 'Indian', 'Pacific', 'Arctic'] },
  { q: 'How many continents are there?', a: '7', opts: ['5', '6', '7', '8'] },
  { q: 'What is the chemical formula for water?', a: 'H2O', opts: ['CO2', 'H2O', 'O2', 'H2'] },
  { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci', opts: ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'] }
];

const games = new Map();

const GAME = {
  name: 'trivia',
  category: 'games',
  description: 'Play trivia quiz',
  commands: ['trivia', 'quiz', 'triv'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const q = questions[Math.floor(Math.random() * questions.length)];
      games.set(sender, { q, answered: false, score: 0 });
      
      let options = '';
      q.opts.forEach((opt, i) => {
        options += `${i + 1}. ${opt}\n`;
      });
      
      return reply(`🧠 *Trivia Question*\n\n${q.q}\n\n${options}Use .trivia answer <1-4>`);
    }

    if (sub === 'answer') {
      const game = games.get(sender);
      if (!game) return reply('Start with .trivia start');
      
      const idx = parseInt(args[1]) - 1;
      if (isNaN(idx) || idx < 0 || idx > 3) return reply('Answer 1-4');
      
      const correct = game.q.opts[idx] === game.q.a;
      games.delete(sender);
      
      return reply(correct ? `✅ *Correct!* Answer: ${game.q.a}` : `❌ *Wrong!* Correct answer: ${game.q.a}`);
    }

    reply('*Trivia*\n.trivia start\n.trivia answer <1-4>');
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
  aliases: ["g4trivia"],
  category: 'games',
  description: "Game: trivia",
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
