'use strict';

const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const { sendInteractiveCarousel, useNativeInteractive, buildSafeCarouselText } = require('../lib/interactiveMenu');
const { getBotTopMedia } = require('../lib/menuMedia');

const ASSET_DIR = path.join(__dirname, '../assets');
const IMAGE_CARDS = ['card1.png', 'card2.png', 'card3.png', 'card4.png', 'card5.png'];
const prefix = () => settings.prefixes?.[0] || '-';

function quick(display_text, id) {
  return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text, id }) };
}

function card(file, title, subtitle, body, action) {
  const mediaPath = path.join(ASSET_DIR, file);
  const media = fs.existsSync(mediaPath) ? fs.readFileSync(mediaPath) : null;
  return {
    header: { title, subtitle, media, mediaType: 'image' },
    body,
    footer: 'ABIX • Tap an action',
    buttons: [quick('OPEN', `${prefix()}${action}`)],
  };
}

function buildCards() {
  const p = prefix();
  const cards = [
    card('card1.png', 'GROUP', 'Admin & moderation', 'Manage groups, protection, joins and admin tools.', 'gcmenu'),
    card('card2.png', 'SOCIAL', 'Search & discovery', 'TikTok, Instagram, Facebook, Reddit, Pinterest, X, LinkedIn, Threads and YouTube.', 'socialmenu'),
    card('card3.png', 'DOWNLOAD', 'Media tools', 'Video/audio/download tools. Protected downloader commands remain unchanged.', 'wpmenu'),
    card('card4.png', 'GAMES', 'Simple games', 'Easy games, rankings and quick-play utilities.', 'funmenu'),
    card('card5.png', 'AI + TOOLS', 'Smart utilities', 'AI, education, Pakistan and other utility categories.', 'aimenu'),
  ];
  // A video-ready sixth card is intentionally opt-in. Carousel video support is
  // client/version sensitive; when enabled, the renderer validates the local file.
  if (String(process.env.ABIX_SLIDER_VIDEO || '').toLowerCase() === 'true') {
    const top = getBotTopMedia();
    if (top) {
      cards.push({
        header: {
          title: `ABIX ${String(top.type).toUpperCase()}`,
          subtitle: 'Current menu media',
          media: fs.readFileSync(top.path),
          mediaType: top.type === 'image' ? 'image' : 'video',
        },
        body: 'Current bot-top media shared by the menu system.',
        footer: 'ABIX • Compatibility-first',
        buttons: [quick('MAIN MENU', `${p}menu`)],
      });
    }
  }
  return cards;
}

module.exports = {
  command: 'slidermenu',
  aliases: ['slider', 'carousel'],
  category: 'system',
  description: 'Compatibility-first interactive command slider.',
  usage: '-slidermenu',
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const cards = buildCards();
    const body = [
      '╭━━〔 ✦ ABIX SLIDER ✦ 〕━━╮',
      `┃ Prefix: *${prefix()}*`,
      `┃ Sections: *${cards.length}*`,
      '┃ Mobile-safe fallback: *ON*',
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      '',
      'Swipe/choose a card when the WhatsApp client supports native carousel messages.',
    ].join('\n');

    const native = useNativeInteractive();
    if (!native) {
      return sock.sendMessage(chatId, {
        text: buildSafeCarouselText({ body, footer: 'Native slider is disabled by default. Use -menu for the reliable category selector.', cards }),
      }, { quoted: message });
    }

    return sendInteractiveCarousel(sock, chatId, { body, footer: 'TEAM ABIX • Compatibility-first UI', cards }, {
      quoted: message,
      nativeInteractive: true,
    });
  },
};
