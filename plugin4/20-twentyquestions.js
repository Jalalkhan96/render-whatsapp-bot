// Auto-adapted from supplied 50-game plugin: 20-twentyquestions.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["20q", "twentyq", "q20"];
const SOURCE_NAME = "twentyquestions";
const PRIMARY = "20q";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'twentyquestions',
  category: 'games',
  description: 'Play 20 questions',
  commands: ['20q', 'twentyq', 'q20'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      games.set(sender, { q: 0, guesses: [] });
      return reply(`❓ *20 Questions*\n\nI'm thinking of something. Ask yes/no questions!\n\nUse .20q ask <question>\nOr .20q guess <answer>`);
    }

    if (sub === 'ask') {
      const game = games.get(sender);
      if (!game) return reply('Start with .20q start');
      
      game.q++;
      if (game.q > 20) return reply('❌ Out of questions!');
      
      const answers = ['Yes', 'No', 'Maybe', 'Probably', 'Probably not', 'Sort of', 'Not really'];
      const answer = answers[Math.floor(Math.random() * answers.length)];
      
      return reply(`🤔 ${answer}\n\nQuestion ${game.q}/20`);
    }

    if (sub === 'guess') {
      const game = games.get(sender);
      if (!game) return reply('Start with .20q start');
      
      games.delete(sender);
      const guess = args.slice(1).join(' ');
      
      return reply(`🎯 You guessed: "${guess}"\n\n${Math.random() > 0.5 ? '🏆 Correct!' : '❌ Wrong!'}`);
    }

    reply('*20 Questions*\n.20q start\n.20q ask <question>\n.20q guess <answer>');
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
  aliases: ["twentyq", "q20", "g4twentyquestions", "g420q"],
  category: 'games',
  description: "Game: twentyquestions",
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
