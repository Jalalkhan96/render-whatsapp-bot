// Auto-adapted from supplied 50-game plugin: 48-charguess.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["charguess", "cgg", "cgame"];
const SOURCE_NAME = "Batman";
const PRIMARY = "charguess";
const ORIGINAL = (() => {
const characters = [
  { name: 'Batman', clues: ['I am a billionaire.', 'I fight crime at night.', 'I live in Gotham.'] },
  { name: 'Sherlock Holmes', clues: ['I am a detective.', 'I live on Baker Street.', 'I have a friend named Watson.'] },
  { name: 'Harry Potter', clues: ['I have a scar on my forehead.', 'I go to a magic school.', 'I have a friend named Ron.'] }
];

const games = new Map();

const GAME = {
  name: 'charguess',
  category: 'games',
  description: 'Guess the character',
  commands: ['charguess', 'cgg', 'cgame'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const char = characters[Math.floor(Math.random() * characters.length)];
      games.set(sender, { char, clueIndex: 0 });
      return reply(`🕵️ *Character Guessing*\n\n💡 ${char.clues[0]}\n\n.charguess clue for next hint\n.charguess guess <name>`);
    }

    if (sub === 'clue') {
      const game = games.get(sender);
      if (!game) return reply('Start with .charguess start');
      
      game.clueIndex++;
      if (game.clueIndex >= game.char.clues.length) return reply('No more clues! Use .charguess guess <name>');
      
      return reply(`💡 ${game.char.clues[game.clueIndex]}`);
    }

    if (sub === 'guess') {
      const game = games.get(sender);
      if (!game) return reply('Start with .charguess start');
      
      games.delete(sender);
      const guess = args.slice(1).join(' ').toLowerCase();
      
      if (guess === game.char.name.toLowerCase()) {
        return reply(`🏆 *Correct!* Character: ${game.char.name}`);
      } else {
        return reply(`❌ *Wrong!* Character: ${game.char.name}`);
      }
    }

    reply('*Character Guessing*\n.charguess start\n.charguess clue\n.charguess guess <name>');
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
  aliases: ["cgg", "cgame", "g4batman", "g4charguess"],
  category: 'games',
  description: "Game: Batman",
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
