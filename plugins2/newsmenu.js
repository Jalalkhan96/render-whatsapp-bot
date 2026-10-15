const settings = require('../settings');
const { SOURCES } = require('../lib/newsrss');
const { getChannelInfo } = require('../lib/channelInfo');
const { sendInteractiveCarousel } = require('../lib/interactiveMenu');

const FAKE_FORWARD = getChannelInfo({ newsletterName: 'ABIX-AE' });

module.exports = {
  command: 'newsmenu',
  aliases: ['nmenu', 'newsources'],
  category: 'info',
  description: 'Shows all news sources for the .news command',
  usage: `${settings.prefixes[0]}newsmenu`,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';

    let text =
      `╭───「 📰 *NEWS SOURCES* 」\n` +
      `│ Pakistan + famous world sites\n` +
      `╰───────────────○\n\n` +
      `*🇵🇰 Pakistan*\n` +
      `└ ⚡ \`${prefix}news pakistan\` — Pakistan top headlines\n` +
      `└ ⚡ \`${prefix}news dawn\` — Dawn News\n` +
      `└ ⚡ \`${prefix}news geo\` — Geo News\n` +
      `└ ⚡ \`${prefix}news tribune\` — Express Tribune\n` +
      `└ ⚡ \`${prefix}news jang\` — Daily Jang (Urdu)\n` +
      `└ ⚡ \`${prefix}news ary\` — ARY News\n` +
      `└ ⚡ \`${prefix}news samaa\` — Samaa TV\n` +
      `└ ⚡ \`${prefix}news humnews\` — HUM News\n\n` +
      `*🌍 World & Famous*\n` +
      `└ ⚡ \`${prefix}news bbc\` — BBC News\n` +
      `└ ⚡ \`${prefix}news bbcurdu\` — BBC Urdu\n` +
      `└ ⚡ \`${prefix}news aljazeera\` — Al Jazeera\n` +
      `└ ⚡ \`${prefix}news cnn\` — CNN\n` +
      `└ ⚡ \`${prefix}news reuters\` — Reuters\n` +
      `└ ⚡ \`${prefix}news skynews\` — Sky News\n` +
      `└ ⚡ \`${prefix}news cricket\` — Cricket News\n` +
      `└ ⚡ \`${prefix}news techcrunch\` — TechCrunch\n\n` +
      `✨ All sources: ${Object.keys(SOURCES).join(' • ')}`;

    await sock.sendMessage(chatId, { text, _skipMenuCard: true }, { quoted: message });
  }
};