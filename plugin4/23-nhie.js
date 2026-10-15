// Auto-adapted from supplied 50-game plugin: 23-nhie.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["nhie", "neverhave"];
const SOURCE_NAME = "nhie";
const PRIMARY = "nhie";
const ORIGINAL = (() => {
const prompts = [
  'Never have I ever lied about my age.',
  'Never have I ever eaten food that fell on the floor.',
  'Never have I ever pretended to be sick to skip work/school.',
  'Never have I ever stalked someone on social media.',
  'Never have I ever broken a bone.',
  'Never have I ever skipped a class.',
  'Never have I ever dyed my hair.',
  'Never have I ever cheated on an exam.'
];

const GAME = {
  name: 'nhie',
  category: 'games',
  description: 'Never have I ever',
  commands: ['nhie', 'neverhave'],
  async handler(ctx) {
    const { reply } = ctx;
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    await reply(`🙈 ${prompt}`);
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
  aliases: ["neverhave", "g4nhie"],
  category: 'games',
  description: "Game: nhie",
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
