// Auto-adapted from supplied 50-game plugin: 06-hangman.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["hangman", "hm"];
const SOURCE_NAME = "hangman";
const PRIMARY = "g4hangman";
const ORIGINAL = (() => {
const words = ['JAVASCRIPT', 'WHATSAPP', 'BAILEYS', 'PROGRAMMING', 'DEVELOPER', 'NODEJS', 'DATABASE', 'FUNCTION', 'VARIABLE', 'ALGORITHM'];
const games = new Map();

const GAME = {
  name: 'hangman',
  category: 'games',
  description: 'Play Hangman',
  commands: ['hangman', 'hm'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const word = words[Math.floor(Math.random() * words.length)];
      games.set(sender, { word, guessed: [], wrong: 0 });
      return reply(`🎯 *Hangman*\n\n${renderWord(word, [])}\n\nWrong: 0/6\nLetters: None\n\nUse .hangman guess <letter>`);
    }

    if (sub === 'guess') {
      const game = games.get(sender);
      if (!game) return reply('Start with .hangman start');
      
      const letter = args[1]?.toUpperCase();
      if (!letter || letter.length !== 1 || !/[A-Z]/.test(letter)) return reply('Guess one letter A-Z');
      
      if (game.guessed.includes(letter)) return reply('Already guessed that letter!');
      
      game.guessed.push(letter);
      if (!game.word.includes(letter)) game.wrong++;
      
      if (game.wrong >= 6) {
        games.delete(sender);
        return reply(`💀 *Game Over!* Word was: *${game.word}*`);
      }
      
      if (game.word.split('').every(c => game.guessed.includes(c))) {
        games.delete(sender);
        return reply(`🏆 *You won!* Word: *${game.word}*`);
      }
      
      return reply(`🎯 *Hangman*\n\n${renderWord(game.word, game.guessed)}\n\nWrong: ${game.wrong}/6\nGuessed: ${game.guessed.join(', ')}`);
    }

    reply('*Hangman*\n.hangman start\n.hangman guess <letter>');
  }
};

function renderWord(word, guessed) {
  return word.split('').map(c => guessed.includes(c) ? c : '_').join(' ');
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
  aliases: [],
  category: 'games',
  description: "Game: hangman",
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
