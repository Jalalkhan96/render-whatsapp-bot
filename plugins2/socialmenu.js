const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const { sendInteractiveCarousel } = require('../lib/interactiveMenu');

const cards = [
  ['📱 SOCIAL • TIKTOK / INSTAGRAM', [
    '.ttsearch <query>', '.ttcomments <url>', '.ttprofile <username>', '.ttvideo <url>',
    '.igsearch <query>', '.igprofile <username>', '.igcomments <url>',
  ]],
  ['📱 SOCIAL • FACEBOOK / REDDIT / PINTEREST', [
    '.fbsearch <query>', '.fbposts <url>', '.fbcomments <url>',
    '.redditsearch <query>', '.redditpost <url>', '.subreddit <name>',
    '.pinsearch <query>', '.pinsimilar <query or Pin URL>', '.pinsimilar (reply to an image)',
    '.pinapify <query> (Apify-only backup)', '.pinscrape <count> <query>',
    '.pintest video <query>', '.pindl video <Pin URL>', '.pinboard <url>', '.pinprofile <username>',
  ]],
  ['📱 SOCIAL • YOUTUBE / X / PROFESSIONAL', [
    '.ytsearch <query>', '.ytvideo <url>', '.ytchannel <url>',
    '.xsearch <query>', '.xprofile <handle>',
    '.linkedinpeople <title>', '.linkedinposts <url>', '.linkedinjobs <title>',
    '.threadsearch <query>', '.threadprofile <username>', '.thread <url>',
    '.snapprofile <username>',
  ]],
];

module.exports = {
  command: 'socialmenu',
  aliases: ['social', 'socials'],
  category: 'social',
  description: 'Social media commands',
  usage: `${settings.prefixes[0]}socialmenu`,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = settings.prefixes[0] || '-';
    const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
    try {
      const text = [
        `📱 *${settings.botName || 'ABIX'} SOCIAL MEDIA MENU*`,
        '',
        ...cards.flatMap(([title, commands]) => [
          `╭───「 ${title} 」`,
          ...commands.map(command => `└ ⚡ ${command.replace('.', prefix)}`),
          '╰───────────────○',
          '',
        ]),
      ].join('\n');
      await sock.sendMessage(chatId, { text, _skipMenuCard: true }, { quoted: message });
    } catch (error) {
      console.error('[SOCIALMENU]', error.message);
      await sock.sendMessage(chatId, { text: '❌ Social menu is temporarily unavailable.' }, { quoted: message });
    }
  },
};
