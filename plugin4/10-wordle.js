// Auto-adapted from supplied 50-game plugin: 10-wordle.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["wordle", "wd"];
const SOURCE_NAME = "wordle";
const PRIMARY = "wordle";
const ORIGINAL = (() => {
const WORDS = ['APPLE', 'BRAIN', 'CRANE', 'DRIVE', 'EAGLE', 'FLAME', 'GLOBE', 'HOUSE', 'IMAGE', 'JUDGE', 'KEYBOARD', 'LEMON', 'MUSIC', 'NATURE', 'ORANGE'];
const games = new Map();

const GAME = {
  name: 'wordle',
  category: 'games',
  description: 'Play Wordle',
  commands: ['wordle', 'wd'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];
      games.set(sender, { word, attempts: [] });
      return reply(`🟩 *Wordle*\n\nGuess the ${word.length}-letter word!\n\nUse .wordle guess <WORD>`);
    }

    if (sub === 'guess') {
      const game = games.get(sender);
      if (!game) return reply('Start with .wordle start');
      
      const guess = args[1]?.toUpperCase();
      if (!guess || guess.length !== game.word.length) return reply(`Guess must be ${game.word.length} letters`);
      
      game.attempts.push(guess);
      const result = evaluateGuess(guess, game.word);
      
      if (guess === game.word) {
        games.delete(sender);
        return reply(`${result}\n\n🏆 *You got it in ${game.attempts.length} tries!*`);
      }
      
      if (game.attempts.length >= 6) {
        games.delete(sender);
        return reply(`${result}\n\n❌ *Out of tries! Word was ${game.word}*`);
      }
      
      return reply(`${result}\n\nAttempts: ${game.attempts.length}/6`);
    }

    reply('*Wordle*\n.wordle start\n.wordle guess <WORD>');
  }
};

function evaluateGuess(guess, word) {
  const result = [];
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === word[i]) result.push('🟩');
    else if (word.includes(guess[i])) result.push('🟨');
    else result.push('⬛');
  }
  return result.join('');
}


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
  aliases: ["wd", "g4wordle"],
  category: 'games',
  description: "Game: wordle",
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
