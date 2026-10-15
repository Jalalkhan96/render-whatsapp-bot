// Auto-adapted from supplied 50-game plugin: 47-hiddencard.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["hiddencard", "hc", "guesscard"];
const SOURCE_NAME = "hiddencard";
const PRIMARY = "hiddencard";
const ORIGINAL = (() => {
const games = new Map();
const cards = ['🂡', '🂢', '🂣', '🂤', '🂥', '🂦', '🂧', '🂨', '🂩', '🂪', '🂫', '🂭', '🂮'];

const GAME = {
  name: 'hiddencard',
  category: 'games',
  description: 'Guess the hidden card',
  commands: ['hiddencard', 'hc', 'guesscard'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const card = cards[Math.floor(Math.random() * cards.length)];
      games.set(`hc-${jid}`, { card, guesses: 0 });
      return reply(`🎴 *Hidden Card*\n\nI have a hidden card.\n\nGuess which one!\n\nUse .hc guess <card>`);
    }

    if (sub === 'guess') {
      const game = games.get(`hc-${jid}`);
      if (!game) return reply('Start with .hc start');
      
      const guess = args[1];
      game.guesses++;
      
      if (guess === game.card) {
        games.delete(`hc-${jid}`);
        return reply(`🏆 *Correct!* Card was: ${game.card}\n\nGuesses: ${game.guesses}`);
      } else {
        return reply(`❌ *Wrong!* Try again.\n\nGuesses: ${game.guesses}`);
      }
    }

    reply('*Hidden Card*\n.hc start\n.hc guess <card>');
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
  aliases: ["hc", "guesscard", "g4hiddencard"],
  category: 'games',
  description: "Game: hiddencard",
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
