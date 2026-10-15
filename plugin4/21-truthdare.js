// Auto-adapted from supplied 50-game plugin: 21-truthdare.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["truth", "dare", "tod", "truthordare"];
const SOURCE_NAME = "truthdare";
const PRIMARY = "tod";
const ORIGINAL = (() => {
const truths = [
  'What is your biggest fear?',
  'Who was your first crush?',
  'What is your most embarrassing moment?',
  'Have you ever lied to your best friend?',
  'What is the worst thing you have done?',
  'What is your biggest weakness?',
  'Have you ever cried?',
  'What is your worst habit?'
];

const dares = [
  'Send a voice note singing your favorite song.',
  'Text someone "I love you".',
  'Change your status to something funny.',
  'Post a silly photo.',
  'Do 10 pushups.',
  'Speak in an accent for the next hour.',
  'Call someone and compliment them.',
  'Draw a portrait of yourself.'
];

const GAME = {
  name: 'truthdare',
  category: 'games',
  description: 'Truth or Dare',
  commands: ['truth', 'dare', 'tod', 'truthordare'],
  async handler(ctx) {
    const { command, reply } = ctx;

    if (command === 'truth') {
      const truth = truths[Math.floor(Math.random() * truths.length)];
      return reply(`💬 *Truth*\n\n${truth}`);
    }

    if (command === 'dare') {
      const dare = dares[Math.floor(Math.random() * dares.length)];
      return reply(`🔥 *Dare*\n\n${dare}`);
    }

    reply('*Truth or Dare*\nUse:\n.truth\n.dare');
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
  aliases: ["g4truthdare", "g4truth"],
  category: 'games',
  description: "Game: truthdare",
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
