// Auto-adapted from supplied 50-game plugin: 14-highlow.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["hl", "higherlower", "hlgame"];
const SOURCE_NAME = "highlow";
const PRIMARY = "hl";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'highlow',
  category: 'games',
  description: 'Higher or Lower card game',
  commands: ['hl', 'higherlower', 'hlgame'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const current = Math.floor(Math.random() * 100) + 1;
      games.set(sender, { current, score: 0 });
      return reply(`🎴 *Higher or Lower*\n\nCurrent card value: *${current}*\n\nWill the next card be higher or lower?\n\nUse .hl higher or .hl lower`);
    }

    if (['higher', 'lower'].includes(sub)) {
      const game = games.get(sender);
      if (!game) return reply('Start with .hl start');
      
      const next = Math.floor(Math.random() * 100) + 1;
      const correct = (sub === 'higher' && next > game.current) || (sub === 'lower' && next < game.current);
      
      if (correct) {
        game.score++;
        game.current = next;
        return reply(`✅ *Correct!* Next card: *${next}*\nScore: ${game.score}\n\nUse .hl higher or .hl lower`);
      } else {
        games.delete(sender);
        return reply(`❌ *Wrong!* Next card was *${next}*.\nFinal Score: ${game.score}`);
      }
    }

    reply('*Higher or Lower*\n.hl start\n.hl higher\n.hl lower');
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
  aliases: ["higherlower", "hlgame", "g4highlow", "g4hl"],
  category: 'games',
  description: "Game: highlow",
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
