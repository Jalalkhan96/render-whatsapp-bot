// Auto-adapted from supplied 50-game plugin: 38-flagguess.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["flag", "flagguess", "fg"];
const SOURCE_NAME = "flagguess";
const PRIMARY = "flag";
const ORIGINAL = (() => {
const flags = [
  { flag: '🇫🇷', country: 'France' },
  { flag: '🇯🇵', country: 'Japan' },
  { flag: '🇧🇷', country: 'Brazil' },
  { flag: '🇦🇺', country: 'Australia' },
  { flag: '🇨🇦', country: 'Canada' },
  { flag: '🇪🇬', country: 'Egypt' },
  { flag: '🇩🇪', country: 'Germany' },
  { flag: '🇮🇹', country: 'Italy' },
  { flag: '🇪🇸', country: 'Spain' },
  { flag: '🇮🇳', country: 'India' }
];

const games = new Map();

const GAME = {
  name: 'flagguess',
  category: 'games',
  description: 'Guess country from flag',
  commands: ['flag', 'flagguess', 'fg'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const f = flags[Math.floor(Math.random() * flags.length)];
      games.set(`flag-${jid}`, f);
      return reply(`🚩 *Guess the Country*\n\n${f.flag}\n\n.flag answer <country>`);
    }

    if (sub === 'answer') {
      const f = games.get(`flag-${jid}`);
      if (!f) return reply('Start with .flag start');
      
      games.delete(`flag-${jid}`);
      const ans = args.slice(1).join(' ').toLowerCase();
      
      if (ans === f.country.toLowerCase()) {
        return reply(`✅ *Correct!* ${f.country}`);
      } else {
        return reply(`❌ *Wrong!* Country: ${f.country}`);
      }
    }

    reply('*Flag Guessing*\n.flag start\n.flag answer <country>');
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
  aliases: ["flagguess", "fg", "g4flagguess", "g4flag"],
  category: 'games',
  description: "Game: flagguess",
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
