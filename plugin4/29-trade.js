// Auto-adapted from supplied 50-game plugin: 29-trade.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["trade", "stocks", "stock"];
const SOURCE_NAME = "trade";
const PRIMARY = "trade";
const ORIGINAL = (() => {
const stocks = { AAPL: 150, GOOG: 2800, TSLA: 900, AMZN: 3400, MSFT: 350 };
const players = new Map();

const GAME = {
  name: 'trade',
  category: 'games',
  description: 'Stock trading',
  commands: ['trade', 'stocks', 'stock'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      players.set(sender, { balance: 10000, portfolio: {} });
      return reply('📈 *Trading Game Started!*\n\n💰 Balance: $10,000\n\n.trade prices\n.trade buy <SYM> <qty>\n.trade sell <SYM> <qty>');
    }

    const p = players.get(sender);
    if (!p) return reply('Start with .trade start');

    if (sub === 'prices') {
      const prices = Object.entries(stocks).map(([k, v]) => `• ${k}: $${v}`).join('\n');
      return reply(`📊 *Stock Prices*\n${prices}`);
    }

    if (sub === 'buy') {
      const [sym, qty] = [args[1]?.toUpperCase(), parseInt(args[2])];
      if (!stocks[sym] || !qty || qty < 1) return reply('Usage: .trade buy <SYM> <qty>');
      
      const cost = stocks[sym] * qty;
      if (cost > p.balance) return reply('❌ Insufficient funds!');
      
      p.balance -= cost;
      p.portfolio[sym] = (p.portfolio[sym] || 0) + qty;
      return reply(`✅ Bought ${qty} ${sym} for $${cost}\n\nBalance: $${p.balance}`);
    }

    if (sub === 'sell') {
      const [sym, qty] = [args[1]?.toUpperCase(), parseInt(args[2])];
      if (!p.portfolio[sym] || p.portfolio[sym] < qty) return reply('❌ Not enough shares!');
      
      p.portfolio[sym] -= qty;
      p.balance += stocks[sym] * qty;
      return reply(`✅ Sold ${qty} ${sym}\n\nBalance: $${p.balance}`);
    }

    if (sub === 'portfolio') {
      const port = Object.entries(p.portfolio).map(([k, v]) => `• ${k}: ${v} shares`).join('\n') || 'Empty';
      return reply(`📊 *Portfolio*\n${port}\n\nBalance: $${p.balance}`);
    }

    reply('*Trading*\n.trade start\n.trade prices\n.trade buy <SYM> <qty>\n.trade sell <SYM> <qty>\n.trade portfolio');
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
  aliases: ["stocks", "stock", "g4trade"],
  category: 'games',
  description: "Game: trade",
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
