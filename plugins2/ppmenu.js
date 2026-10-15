'use strict';

/**
 * ppmenu.js — owner-only PP command menu as a native swipeable slider.
 *
 * Sent via sock.relayMessage directly (pplib/slider.cjs), NOT through the
 * patched sock.sendMessage — so NO fake-forward styling is applied.
 * The old lib/interactiveMenu path is no longer used here.
 */

const { sendSlider } = require('./pplib/slider.cjs');

let menuState = null;
try { menuState = require('../lib/menuState'); } catch { menuState = null; }

let settings = {};
try { settings = require('../settings'); } catch { settings = {}; }

// Safe-only card set. Adult video search cards are removed.
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
const cards = [
  { label: '📚 WEBTOON', hint: '-ppwebtoon <search>', test: 'webtoons', cmd: 'ppwebtoon' },
  { label: '📚 TAPAS', hint: '-pptapas <series-url>', test: 'tapas', cmd: 'pptapas' },
];
const CARD_ICON = { ppwebtoon: favicon('webtoons.com'), pptapas: favicon('tapas.io') };

module.exports = {
  command: 'ppmenu',
  aliases: ['pp', 'privatemenu'],
  category: 'owner',
  ownerOnly: true,
  description: 'Owner-only safe comics menu (slider, no fake-forward)',
  usage: '-ppmenu [on|off]',

  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes?.[0] || '-';

    if (menuState && !menuState.isMenuEnabled('ppmenu', chatId)) {
      return sock.sendMessage(chatId, {
        text: `🔒 *PP MENU OFF*\n\nUse ${prefix}ppmenu on first.`,
        contextInfo: {},
      }, { quoted: message });
    }

    let shown = false;
    try {
      shown = await sendSlider(sock, chatId, {
        bodyText: '╭━━━〔 🔐 ABIX PP PRIVATE 〕━━━╮\n┃ Owner + Secondary Owner only\n┃ 2 safe comic cards — all working\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\nTap a button to open a safe comics tool',
        footerText: 'ABIX • Private • no forward',
        maxCards: 2,
        items: cards.map((item, index) => ({
          title: `${index + 1}. ${item.label}`,
          body: `Owner + Secondary Owner only\nCommand: ${prefix}${item.hint}\nDiagnostic: ${prefix}pptest ${item.test}`,
          footer: 'Private • safe comics search + download',
          imageUrl: CARD_ICON[item.cmd],
          buttons: [
            { text: '🧪 TEST SITE', id: `${prefix}pptest ${item.test}` },
            { text: '📋 COMMAND', id: `${prefix}${item.cmd}` },
          ],
        })),
      });
    } catch (error) {
      console.error('[PPMENU] slider failed:', error?.message || error);
      shown = false;
    }

    if (shown) return;

    // Slider unavailable/unsupported: always return a normal WhatsApp text message.
    const lines = cards.map((item, i) => `${i + 1}. ${item.label} → ${prefix}${item.hint}`);
    return sock.sendMessage(chatId, {
      text: `🔐 *ABIX PP PRIVATE*\n\n${lines.join('\n')}\n\nUse ${prefix}pptest <site> to test a source.`,
      contextInfo: {},
    }, { quoted: message });
  },
};
