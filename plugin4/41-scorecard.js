// Auto-adapted from supplied 50-game plugin: 41-scorecard.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["scorecard", "sc", "score"];
const SOURCE_NAME = "scorecard";
const PRIMARY = "scorecard";
const ORIGINAL = (() => {
const sessions = new Map();

const GAME = {
  name: 'scorecard',
  category: 'games',
  description: 'Game score tracker',
  commands: ['scorecard', 'sc', 'score'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'new') {
      sessions.set(`sc-${jid}`, { players: {}, session: 1 });
      return reply('📊 *New Scorecard*\n\n.sc add <name>\n.sc score <name> <points>\n.sc show');
    }

    const s = sessions.get(`sc-${jid}`);
    if (!s) return reply('Start with .sc new');

    if (sub === 'add') {
      const name = args[1] || sender.split('@')[0];
      s.players[name] = { score: 0, user: sender };
      return reply(`✅ Added *${name}*!`);
    }

    if (sub === 'score') {
      const [name, points] = [args[1], parseInt(args[2])];
      if (!s.players[name]) return reply('Player not found!');
      s.players[name].score += points;
      return reply(`📊 *${name}: ${s.players[name].score}*`);
    }

    if (sub === 'show') {
      const list = Object.entries(s.players)
        .sort((a, b) => b[1].score - a[1].score)
        .map(([n, d]) => `${n}: ${d.score}`)
        .join('\n');
      return reply(`📊 *Scorecard*\n${list || 'No players'}`);
    }

    if (sub === 'reset') {
      sessions.delete(`sc-${jid}`);
      return reply('Scorecard reset.');
    }

    reply('*Scorecard*\n.sc new\n.sc add <name>\n.sc score <name> <points>\n.sc show\n.sc reset');
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
  aliases: ["score", "g4scorecard"],
  category: 'games',
  description: "Game: scorecard",
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
