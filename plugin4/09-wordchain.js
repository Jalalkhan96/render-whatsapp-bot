// Auto-adapted from supplied 50-game plugin: 09-wordchain.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["wordchain", "wcg", "wc"];
const SOURCE_NAME = "wordchain";
const PRIMARY = "wordchain";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'wordchain',
  category: 'games',
  description: 'Play word chain game',
  commands: ['wordchain', 'wcg', 'wc'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const startWord = args[1]?.toLowerCase() || 'apple';
      games.set(`wcg-${jid}`, { last: startWord, used: [startWord], players: [sender], turn: 0 });
      return reply(`🔗 *Word Chain* started!\n\nFirst word: *${startWord}*\n\nNext word must start with: *${startWord.slice(-1).toUpperCase()}*\n\nUse .wordchain say <word>`);
    }

    if (sub === 'say') {
      const game = games.get(`wcg-${jid}`);
      if (!game) return reply('Start with .wordchain start');
      
      const word = args[1]?.toLowerCase();
      if (!word) return reply('Usage: .wordchain say <word>');
      
      if (word[0] !== game.last.slice(-1)) return reply(`❌ Must start with *${game.last.slice(-1).toUpperCase()}*`);
      if (game.used.includes(word)) return reply('❌ Word already used!');
      
      game.used.push(word);
      game.last = word;
      
      return reply(`✅ *${word}*\n\nNext must start with: *${word.slice(-1).toUpperCase()}*\nWords used: ${game.used.length}`);
    }

    if (sub === 'end') {
      games.delete(`wcg-${jid}`);
      return reply('Game ended.');
    }

    reply('*Word Chain*\n.wordchain start [word]\n.wordchain say <word>\n.wordchain end');
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
  aliases: ["wcg", "wc", "g4wordchain"],
  category: 'games',
  description: "Game: wordchain",
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
