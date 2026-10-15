// Auto-adapted from supplied 50-game plugin: 50-songguess.js
const rank = require('../lib/game4Ranking');
const SOURCE_COMMANDS = ["songguess", "sg", "museguess"];
const SOURCE_NAME = "songguess";
const PRIMARY = "songguess";
const ORIGINAL = (() => {
const songs = [
  { lyrics: 'I am the king of the world', title: 'Bohemian Rhapsody' },
  { lyrics: 'Do not stop me now', title: 'Don\'t Stop Me Now' },
  { lyrics: 'Hey Jude', title: 'Hey Jude' },
  { lyrics: 'Imagine all the people', title: 'Imagine' },
  { lyrics: 'We will we will rock you', title: 'We Will Rock You' },
  { lyrics: 'I love you', title: 'Love Song' }
];

const games = new Map();

const GAME = {
  name: 'songguess',
  category: 'games',
  description: 'Guess the song',
  commands: ['songguess', 'sg', 'museguess'],
  async handler(ctx) {
    const { args, jid, sender, reply } = ctx;
    const sub = args[0];

    if (sub === 'start') {
      const song = songs[Math.floor(Math.random() * songs.length)];
      games.set(`sg-${jid}`, song);
      return reply(`🎵 *Song Guessing*\n\nLyrics: "${song.lyrics}"\n\nGuess the song!\n\n.songguess answer <title>`);
    }

    if (sub === 'answer') {
      const song = games.get(`sg-${jid}`);
      if (!song) return reply('Start with .songguess start');
      
      games.delete(`sg-${jid}`);
      const ans = args.slice(1).join(' ').toLowerCase();
      
      if (ans.includes(song.title.toLowerCase())) {
        return reply(`✅ *Correct!* Song: ${song.title}`);
      } else {
        return reply(`❌ *Wrong!* Song: ${song.title}`);
      }
    }

    reply('*Song Guessing*\n.songguess start\n.songguess answer <title>');
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
  aliases: ["sg", "museguess", "g4songguess"],
  category: 'games',
  description: "Game: songguess",
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
