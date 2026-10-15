// Auto-adapted from supplied 50-game plugin: 22-wyr.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["wyr", "wyrat", "wouldyourather"];
const SOURCE_NAME = "wyr";
const PRIMARY = "wyrat";
const ORIGINAL = (() => {
const questions = [
  'Would you rather fly or be invisible?',
  'Would you rather be rich or famous?',
  'Would you rather read minds or see the future?',
  'Would you rather never sleep or never eat?',
  'Would you rather have the ability to fly or be super strong?',
  'Would you rather always be hot or always be cold?',
  'Would you rather be able to talk to animals or speak all languages?',
  'Would you rather have unlimited money or unlimited time?'
];

const GAME = {
  name: 'wyr',
  category: 'games',
  description: 'Would you rather',
  commands: ['wyr', 'wyrat', 'wouldyourather'],
  async handler(ctx) {
    const { reply } = ctx;
    const question = questions[Math.floor(Math.random() * questions.length)];
    await reply(`🤔 ${question}`);
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
  aliases: ["g4wyr"],
  category: 'games',
  description: "Game: wyr",
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
