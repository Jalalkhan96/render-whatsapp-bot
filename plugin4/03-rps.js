// Auto-adapted from supplied 50-game plugin: 03-rps.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["rps"];
const SOURCE_NAME = "rps";
const PRIMARY = "rps";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'rps',
  category: 'games',
  description: 'Play Rock Paper Scissors',
  commands: ['rps'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'play' || sub === 'start') {
      const choice = args[1]?.toLowerCase();
      if (!['rock', 'paper', 'scissors'].includes(choice)) {
        return reply('*Rock Paper Scissors*\n\nUse: .rps rock, .rps paper, or .rps scissors');
      }

      const choices = ['rock', 'paper', 'scissors'];
      const botChoice = choices[Math.floor(Math.random() * 3)];
      
      let result = '';
      if (choice === botChoice) {
        result = '🤝 Draw!';
      } else if (
        (choice === 'rock' && botChoice === 'scissors') ||
        (choice === 'paper' && botChoice === 'rock') ||
        (choice === 'scissors' && botChoice === 'paper')
      ) {
        result = '🏆 You win!';
      } else {
        result = '❌ Bot wins!';
      }

      return reply(`*Rock Paper Scissors*\n\nYou: ${choice}\nBot: ${botChoice}\n\n${result}`);
    }

    reply('*Rock Paper Scissors*\nUsage:\n.rps rock\n.rps paper\n.rps scissors');
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
  aliases: ["g4rps"],
  category: 'games',
  description: "Game: rps",
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
