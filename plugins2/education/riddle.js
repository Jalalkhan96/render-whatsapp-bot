const axios = require('axios');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

const LOCAL_RIDDLES = [
  { r: 'Aisa kaun sa cheez hai jo bahar se zyada andar se saaf hoti hai?', a: 'Shishe ki khidki' },
  { r: 'Jitna zyada khaao, utna zyada barsaa rahna?', a: 'Aag' },
  { r: 'I speak without a mouth and hear without ears. What am I?', a: 'Echo' },
  { r: 'The more you take, the more you leave behind. What are they?', a: 'Footsteps' }
];

module.exports = {
  command: 'riddle',
  aliases: ['paheli', 'brainteaser', 'puzzle'],
  category: 'education',
  description: 'Random riddle / paheli with answer',
  usage: '.riddle',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    let riddle = null;
    try {
      const r = await axios.get('https://riddles-api.vercel.app/random', { timeout: 10000 });
      if (r.data?.riddle) riddle = r.data;
    } catch (e) {
      console.error('[RIDDLE] api fail:', e.message);
    }
    if (!riddle) riddle = LOCAL_RIDDLES[Math.floor(Math.random() * LOCAL_RIDDLES.length)];

    const text =
      `🧩 *Riddle / Paheli*\n\n` +
      `❓ ${riddle.riddle}\n\n` +
      `💡 Sahi jawab: ||${riddle.answer}||\n\n` +
      `🗝️ Click karke reveal karo — emoji/slash ka khulne ka effect aye ga nahi, bas answer niche likha hai 😉`;

    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
  }
};