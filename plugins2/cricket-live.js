const axios = require('axios');

const CHANNEL_JID = process.env.NEWSLETTER_JID || '120363413637544342@newsletter';
const CHANNEL_NAME = process.env.NEWSLETTER_NAME || 'ABIX-AE';

const FAKE_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: CHANNEL_JID,
    newsletterName: CHANNEL_NAME,
    serverMessageId: -1
  }
};

async function fetchCricketScores() {
  const endpoints = [
    'https://site.api.espn.com/apis/site/v2/sports/cricket/8039/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/cricket/25/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/cricket/26/scoreboard',
    'https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard?limit=50'
  ];

  for (const url of endpoints) {
    try {
      const response = await axios.get(url, { timeout: 15000 });
      if (response.data?.events?.length) return response.data.events;
    } catch (error) {}
  }

  try {
    const response = await axios.get('https://api.crictapi.com/cricket/live', { timeout: 10000 });
    if (response.data?.data?.length) return response.data.data;
  } catch (error) {}

  return null;
}

function formatMatch(event) {
  try {
    if (event.name && event.status) {
      const status = event.status?.type?.detail || event.status?.displayClock || 'In Progress';
      const competitors = event.competitions?.[0]?.competitors || [];
      const teams = competitors.map(team =>
        `${team.team?.abbreviation || team.team?.name}: ${team.score || '0'}`
      ).join(' vs ') || event.name;
      return `🏏 *${event.name}*\n└ ${teams}\n└ 📊 ${status}`;
    }
    if (event.name && event.score) return `🏏 *${event.name}*\n└ 📊 ${event.score}`;
    return `🏏 *${JSON.stringify(event).substring(0, 100)}*`;
  } catch (error) {
    return '🏏 Match info unavailable';
  }
}

module.exports = {
  command: 'cricket',
  aliases: ['cricketapi', 'cric', 'livecricket'],
  category: 'sports',
  description: 'Get live cricket scores',
  usage: '-cricket',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;

    try {
      await sock.sendMessage(chatId, { react: { text: '🏏', key: message.key } });
      const events = await fetchCricketScores();
      let text;

      if (!events || events.length === 0) {
        text = '╭───「 🏆 *CRICKET LIVE* 」\n│\n│ 😴 *Koi live match nahi chal raha abhi!*\n│ Baad mein try karo.\n│\n╰───「 ✨ ABIX-AE 」';
      } else {
        text = `╭───「 🏆 *LIVE CRICKET SCORES* 」\n│\n│ 🔴 Live Matches: ${events.length}\n│\n╰───────────────────○\n\n${events.slice(0, 5).map(formatMatch).join('\n\n')}\n\n> ✨ *Powered by ABIX-AE*`;
      }

      await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    } catch (error) {
      console.error('Cricket error:', error.message);
      await sock.sendMessage(chatId, {
        text: '❌ Cricket API down hai ya score fetch nahi ho raha. Thodi der baad try karo!',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }
  }
};