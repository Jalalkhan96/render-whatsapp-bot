// Auto-adapted from supplied 50-game plugin: 30-akinator.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["akinator", "aki", "genie"];
const SOURCE_NAME = "akinator";
const PRIMARY = "akinator";
const ORIGINAL = (() => {
const characters = ['Batman', 'Superman', 'Wonder Woman', 'Spider-Man', 'Iron Man', 'Thor', 'Hulk', 'Black Widow'];
const games = new Map();

const GAME = {
  name: 'akinator',
  category: 'games',
  description: 'Akinator 20 questions',
  commands: ['akinator', 'aki', 'genie'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      games.set(sender, { q: 0, answers: [] });
      return reply(`🧞 *Akinator*\n\nThink of a famous person.\n\nQuestion 1: Is your person male?\n\nAnswer: .akinator yes or .akinator no`);
    }

    if (['yes', 'no'].includes(sub?.toLowerCase())) {
      const game = games.get(sender);
      if (!game) return reply('Start with .akinator start');
      
      game.answers.push(sub.toLowerCase());
      game.q++;
      
      if (game.q >= 3) {
        games.delete(sender);
        const guess = characters[Math.floor(Math.random() * characters.length)];
        return reply(`🧞 I think your person is... *${guess}*!\n\nWas I right?`);
      }
      
      const questions = [
        'Is your person male?',
        'Is your person an actor?',
        'Is your person a singer?'
      ];
      
      return reply(`Question ${game.q + 1}: ${questions[game.q]}`);
    }

    reply('*Akinator*\n.akinator start\nAnswer questions with:\n.akinator yes\n.akinator no');
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
  aliases: ["aki", "genie", "g4akinator"],
  category: 'games',
  description: "Game: akinator",
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
