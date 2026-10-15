'use strict';

const { prepareWAMessageMedia, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const { buildInteractiveAdditionalNodes } = require('../lib/interactiveNodes');
const { isOwner } = require('../lib/owner');

const RESULTS_PER_PAGE = 5;

let modulePromise;
function loadGoogleModule() {
  if (!modulePromise) modulePromise = import('../plugin3/googleImageSearch.mjs');
  return modulePromise;
}

function clean(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function clip(value, max = 100) {
  const text = clean(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function quickButton(displayText, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: displayText, id }),
  };
}

function additionalNodes(jid) {
  return buildInteractiveAdditionalNodes(jid, true);
}

async function sendFallback(sock, msg, from, data, page) {
  const safe = await loadGoogleModule();
  const start = page * RESULTS_PER_PAGE;
  const pageItems = data.results.slice(start, start + RESULTS_PER_PAGE);
  const lines = [
    '🖼️ *GOOGLE IMAGE SEARCH*',
    `🔍 Query: *${clip(data.query, 90)}*`,
    `🛡️ Safe Search: *${data.safeSearch ? 'ON' : 'OFF'}*`,
    '',
  ];

  let sent = 0;
  for (let index = 0; index < pageItems.length; index += 1) {
    const item = pageItems[index];
    const prepared = await safe.prepareImage(item);
    if (!prepared) continue;
    try {
      await sock.sendMessage(from, {
        image: prepared.buffer,
        caption: `${sent + 1}. ${clip(item.title, 120)}`,
      }, { quoted: msg });
      sent += 1;
    } catch {}
  }

  const totalPages = Math.ceil(data.results.length / RESULTS_PER_PAGE);
  const nav = [];
  if (page > 0) nav.push(`${data.prefix}image __button prev ${data.token} ${page}`);
  if (page < totalPages - 1) nav.push(`${data.prefix}image __button next ${data.token} ${page}`);

  if (sent === 0) {
    lines.push('❌ Images could not be loaded.');
  } else if (nav.length) {
    lines.push('', `Navigation: ${nav.join('  |  ')}`);
  }

  return sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg });
}

async function sendCarousel({ sock, msg, from, data, page }) {
  const safe = await loadGoogleModule();
  const start = page * RESULTS_PER_PAGE;
  const pageItems = data.results.slice(start, start + RESULTS_PER_PAGE);
  if (!pageItems.length) return false;

  const totalPages = Math.ceil(data.results.length / RESULTS_PER_PAGE);
  const cards = [];

  for (let i = 0; i < pageItems.length; i += 1) {
    const item = pageItems[i];
    const prepared = await safe.prepareImage(item);
    if (!prepared) continue;

    const preparedMedia = await prepareWAMessageMedia(
      { image: prepared.buffer },
      { upload: sock.waUploadToServer }
    );
    if (!preparedMedia?.imageMessage) continue;

    const buttons = [];
    if (page > 0 && i === 0) buttons.push(quickButton('⬅️ PREV', `${data.prefix}image __button prev ${data.token} ${page}`));
    if (i === pageItems.length - 1 && page < totalPages - 1) buttons.push(quickButton('MORE ➡️', `${data.prefix}image __button next ${data.token} ${page}`));

    cards.push({
      header: {
        title: clip(item.title, 60),
        subtitle: safe.getSafeSearchEnabled ? '' : '',
        hasMediaAttachment: true,
        imageMessage: preparedMedia.imageMessage,
      },
      body: { text: `${item.width && item.height ? `${item.width}×${item.height}` : 'Google Image'}\n${clip(item.sourceUrl || 'Source unavailable', 120)}` },
      footer: { text: `Google Images • ${i + 1}/${pageItems.length}` },
      nativeFlowMessage: { buttons, messageParamsJson: '' },
    });
  }

  if (!cards.length) return false;

  try {
    const carousel = proto.Message.InteractiveMessage.CarouselMessage.fromObject({
      cards,
      messageVersion: 1,
      carouselCardType: 1,
    });

    const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
      body: {
        text:
          '🖼️ *GOOGLE IMAGE SEARCH*\n\n' +
          `🔍 Query: *${clip(data.query, 100)}*\n` +
          `📸 Results: *${data.results.length}*\n` +
          `🛡️ Safe Search: *${data.safeSearch ? 'ON' : 'OFF'}*\n\n` +
          '👈 Swipe left/right 👉',
      },
      footer: { text: 'myBOT • Google Images' },
      carouselMessage: carousel,
    });

    const generated = generateWAMessageFromContent(
      from,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage,
          },
        },
      },
      { quoted: msg, userJid: sock.user?.id }
    );

    await sock.relayMessage(from, generated.message, {
      messageId: generated.key.id,
      additionalNodes: additionalNodes(from),
    });

    return true;
  } catch (error) {
    console.warn('[IMG] Native carousel failed; using image/text fallback:', error?.message || error);
    return false;
  }
}

async function executeImage(sock, message, args = [], context = {}) {
  const from = context.chatId || message?.key?.remoteJid;
  const prefix = context.prefix || require('../settings').prefixes[0] || '-';
  if (!from) return;

  if (args[0] === '__button') {
    const action = clean(args[1]).toLowerCase();
    const token = clean(args[2]);
    const currentPage = Number(args[3]);
    if (!['next', 'more', 'prev'].includes(action) || !token || !Number.isFinite(currentPage)) return;

    const google = await loadGoogleModule();
    const data = google.getPending(token);
    if (!data) {
      return sock.sendMessage(from, { text: '⌛ *IMAGE SEARCH EXPIRED*\nPlease search again.' }, { quoted: message });
    }

    const totalPages = Math.ceil(data.results.length / RESULTS_PER_PAGE);
    const newPage = (action === 'prev' ? currentPage - 1 : currentPage + 1);
    if (newPage < 0 || newPage >= totalPages) return;

    if (await sendCarousel({ sock, msg: message, from, data, page: newPage })) return;
    await sendFallback(sock, message, from, data, newPage);
    return;
  }

  const query = clean(args.join(' '));
  if (!query) {
    return sock.sendMessage(from, {
      text: `🖼️ *IMAGE SEARCH*\nUsage: ${prefix}image <query>\nExample: ${prefix}image Pakistan mountains`,
    }, { quoted: message });
  }

  const google = await loadGoogleModule();
  const safeSearch = await google.getSafeSearchEnabled();
  const results = await google.googleImageSearch(query, { limit: 20, safeSearch });
  const token = google.createToken();
  const data = { token, query, results, safeSearch, prefix };
  google.savePending(token, data);

  if (await sendCarousel({ sock, msg: message, from, data, page: 0 })) return;
  await sendFallback(sock, message, from, data, 0);
}

async function executeSafeSearch(sock, message, args = [], context = {}) {
  const from = context.chatId || message?.key?.remoteJid;
  const prefix = context.prefix || require('../settings').prefixes[0] || '-';
  const google = await loadGoogleModule();
  const current = await google.getSafeSearchEnabled();
  const action = clean(args[0]).toLowerCase();

  if (!action) {
    return sock.sendMessage(from, {
      text: [
        '🛡️ *GOOGLE IMAGE SAFE SEARCH*',
        '',
        `Status: *${current ? 'ON ✅' : 'OFF ⚠️'}*`,
        '',
        `Turn ON:  ${prefix}imgsafe on`,
        `Turn OFF: ${prefix}imgsafe off *(owner only)*`,
      ].join('\n'),
    }, { quoted: message });
  }

  if (!['on', 'off', 'status'].includes(action)) {
    return sock.sendMessage(from, { text: `Usage: ${prefix}imgsafe <on|off|status>` }, { quoted: message });
  }

  if (action === 'status') {
    return sock.sendMessage(from, { text: `🛡️ Google Image Safe Search: *${current ? 'ON' : 'OFF'}*` }, { quoted: message });
  }

  const senderId = context.senderId || message?.key?.participant || message?.key?.senderPn || message?.key?.remoteJid;
  const authorizedOwner = Boolean(context.isOwner) || await isOwner(senderId, sock, from);
  if (!authorizedOwner) {
    return sock.sendMessage(from, { text: '❌ Only the configured primary/secondary owner can change Google Image Safe Search.' }, { quoted: message });
  }

  const enabled = action === 'on';
  await google.setSafeSearchEnabled(enabled);
  return sock.sendMessage(from, {
    text: `✅ Google Image Safe Search is now *${enabled ? 'ON' : 'OFF'}*.\n${enabled ? 'All image searches use Google SafeSearch.' : 'SafeSearch is disabled until an owner turns it back on.'}`,
  }, { quoted: message });
}

module.exports = [
  {
    command: 'image',
    aliases: ['img', 'pic', 'images', 'googleimage', 'gis'],
    category: 'search',
    description: 'Search Google Images with a mobile-safe carousel and fallback.',
    usage: '-image <query>',
    cooldown: 1500,
    async handler(sock, message, args, context = {}) {
      try {
        await executeImage(sock, message, args, context);
      } catch (error) {
        console.error('[IMG] Search failed:', error?.message || error);
        const jid = context.chatId || message?.key?.remoteJid;
        if (jid) await sock.sendMessage(jid, {
          text: `❌ *IMAGE SEARCH FAILED*\n${clean(error?.message, 'Google Images search failed.')}\n\nSafe Search remains protected by the owner setting.`,
        }, { quoted: message }).catch(() => {});
      }
    },
  },
  {
    command: 'imgsafe',
    aliases: ['imagesafe', 'safesearch'],
    category: 'owner',
    description: 'View or change Google Image SafeSearch. Only configured owners may change it.',
    usage: '-imgsafe <on|off|status>',
    async handler(sock, message, args, context = {}) {
      await executeSafeSearch(sock, message, args, context);
    },
  },
];
