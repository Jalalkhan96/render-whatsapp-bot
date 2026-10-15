// Auto-adapted from supplied 50-game plugin: 11-blackjack.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["blackjack", "bj", "bjack"];
const SOURCE_NAME = "blackjack";
const PRIMARY = "blackjack";
const ORIGINAL = (() => {
const games = new Map();

const GAME = {
  name: 'blackjack',
  category: 'games',
  description: 'Play Blackjack',
  commands: ['blackjack', 'bj', 'bjack'],
  async handler(ctx) {
    const { args, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const deck = createDeck();
      const player = [deck.pop(), deck.pop()];
      const dealer = [deck.pop(), deck.pop()];
      games.set(sender, { deck, player, dealer, bet: parseInt(args[1]) || 100 });
      
      return reply(`🃏 *Blackjack*\n\nYour hand: ${formatCards(player)}\nValue: ${handValue(player)}\n\nDealer shows: ${formatCards([dealer[0]])}\n\nUse .bj hit or .bj stand`);
    }

    if (sub === 'hit') {
      const game = games.get(sender);
      if (!game) return reply('Start with .bj start');
      
      game.player.push(game.deck.pop());
      const val = handValue(game.player);
      
      if (val > 21) {
        games.delete(sender);
        return reply(`💥 *BUST!* Value: ${val}\n\nYou lose!`);
      }
      
      return reply(`🃏 Your hand: ${formatCards(game.player)}\nValue: ${val}\n\nUse .bj hit or .bj stand`);
    }

    if (sub === 'stand') {
      const game = games.get(sender);
      if (!game) return reply('Start with .bj start');
      
      while (handValue(game.dealer) < 17) game.dealer.push(game.deck.pop());
      
      const pVal = handValue(game.player);
      const dVal = handValue(game.dealer);
      games.delete(sender);
      
      let result = '';
      if (pVal > 21) result = '💥 You bust! Dealer wins!';
      else if (dVal > 21) result = '🏆 Dealer busts! You win!';
      else if (pVal > dVal) result = '🏆 You win!';
      else if (pVal === dVal) result = '🤝 Push!';
      else result = '❌ Dealer wins!';
      
      return reply(`🃏 Your: ${formatCards(game.player)} (${pVal})\nDealer: ${formatCards(game.dealer)} (${dVal})\n\n${result}`);
    }

    reply('*Blackjack*\n.bj start [bet]\n.bj hit\n.bj stand');
  }
};

function createDeck() {
  const deck = [];
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function formatCards(cards) {
  return cards.map(c => c.value + c.suit).join(' ');
}

function handValue(cards) {
  let value = 0, aces = 0;
  for (const card of cards) {
    if (card.value === 'A') {
      aces++;
      value += 11;
    } else if (['J', 'Q', 'K'].includes(card.value)) {
      value += 10;
    } else {
      value += parseInt(card.value);
    }
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}


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
  aliases: ["bj", "bjack", "g4blackjack"],
  category: 'games',
  description: "Game: blackjack",
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
