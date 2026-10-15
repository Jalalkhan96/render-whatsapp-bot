'use strict';
const axios = require('axios');
const settings = require('../settings');
const nekoGroups = require('../lib/nekoGroups');
const isAdmin = require('../lib/isAdmin');
const { BLOCKED_NEKO_TAGS } = require('../lib/contentRestrictions');

const NEKOSBEST_BASE = 'https://nekos.best/api/v2';
const WAIFU_IM_BASE = 'https://api.waifu.im';
const MAX_AMOUNT = 20;
const REQUEST_TIMEOUT = 20000;
const UA = 'ABIX-Neko-Safe/1.0';
const TAGS = Object.freeze([
  'waifu', 'husbando', 'kitsune', 'neko', 'maid', 'uniform', 'selfies',
  'genshin-impact', 'raiden-shogun', 'marin-kitagawa', 'mori-calliope',
  'kamisato-ayaka', 'rem', 'nami', 'one-piece',
]);
const NEKOSBEST_IMAGE_CATEGORIES = new Set(['husbando', 'kitsune', 'neko', 'waifu']);
function prefix() { return settings.prefixes?.[0] || '-'; }
function clampAmount(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_AMOUNT, Math.floor(n))) : fallback;
}
async function getNekosBestImages(category, amount) {
  const response = await axios.get(`${NEKOSBEST_BASE}/${encodeURIComponent(category)}`, {
    params: { amount: clampAmount(amount) }, timeout: REQUEST_TIMEOUT,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  return (Array.isArray(response.data?.results) ? response.data.results : [])
    .filter(item => /^https?:\/\//i.test(String(item?.url || '')));
}
async function getWaifuImImages(tag, amount) {
  const response = await axios.get(`${WAIFU_IM_BASE}/images`, {
    params: { IncludedTags: tag, IsNsfw: 'False', PageSize: clampAmount(amount) },
    timeout: REQUEST_TIMEOUT, headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  return (Array.isArray(response.data?.items) ? response.data.items : [])
    .filter(item => /^https?:\/\//i.test(String(item?.url || '')));
}
function resolveTag(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value || value === 'random') return TAGS[Math.floor(Math.random() * TAGS.length)];
  if (/^\d+$/.test(value)) return TAGS[Number(value) - 1] || null;
  return TAGS.includes(value) ? value : null;
}
function parseRequest(args = []) {
  const tokens = args.map(value => String(value).trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return { tagInput: 'waifu', amount: 1 };
  const first = tokens[0];
  const amountToken = tokens.find((token, index) => index > 0 && /^\d+$/.test(token));
  return { tagInput: first, amount: clampAmount(amountToken || 1) };
}
async function sendCategoryList(sock, msg, chatId) {
  return sock.sendMessage(chatId, {
    text: `🐾 *SAFE NEKO CATEGORIES*\n\n${TAGS.map((tag, i) => `${String(i + 1).padStart(2, '0')}. ${tag}`).join('\n')}\n\nUse ${prefix()}neko <tag> [amount]`,
  }, { quoted: msg });
}
async function sendImages(sock, msg, chatId, category, images, provider) {
  for (let i = 0; i < images.length; i++) {
    await sock.sendMessage(chatId, {
      image: { url: images[i].url },
      caption: `🐾 *NEKO*\n🏷️ Tag: *${category}*\n🖼️ ${i + 1}/${images.length}\n⚙️ ${provider}`,
    }, { quoted: msg });
  }
}

module.exports = {
  command: 'neko', aliases: ['waifu', 'nekopic', 'nimg'], category: 'fun',
  description: 'Send safe anime images by category, number, or amount.',
  usage: `${prefix()}neko [tag|number|random] [amount]`,
  async handler(sock, msg, args = [], context = {}) {
    const chatId = context.chatId || msg.key.remoteJid;
    const isGroup = String(chatId).endsWith('@g.us');
    const requested = args.join(' ').trim().toLowerCase();
    const first = requested.split(/\s+/)[0] || '';
    if (BLOCKED_NEKO_TAGS.has(first) || /\b(?:nsfw|hentai|porn|rule34|explicit|nude|nudity)\b/i.test(requested)) {
      return sock.sendMessage(chatId, { text: '🚫 This category is disabled on this bot.' }, { quoted: msg });
    }
    if (requested === 'on' || requested === 'enable') {
      if (!isGroup) return sock.sendMessage(chatId, { text: '❌ This command can only be enabled in groups.' }, { quoted: msg });
      const senderId = context.senderId || msg.key.participant || msg.key.remoteJid;
      const adminStatus = await isAdmin(sock, chatId, senderId);
      if (!adminStatus.isSenderAdmin && !context.isOwner) return sock.sendMessage(chatId, { text: '❌ Only a group admin or configured owner can enable Neko.' }, { quoted: msg });
      nekoGroups.enableGroup(chatId);
      return sock.sendMessage(chatId, { text: '✅ Safe Neko commands are now enabled in this group.' }, { quoted: msg });
    }
    if (requested === 'off' || requested === 'disable') {
      if (!isGroup) return sock.sendMessage(chatId, { text: '❌ This command can only be disabled in groups.' }, { quoted: msg });
      const senderId = context.senderId || msg.key.participant || msg.key.remoteJid;
      const adminStatus = await isAdmin(sock, chatId, senderId);
      if (!adminStatus.isSenderAdmin && !context.isOwner) return sock.sendMessage(chatId, { text: '❌ Only a group admin or configured owner can disable Neko.' }, { quoted: msg });
      nekoGroups.disableGroup(chatId);
      return sock.sendMessage(chatId, { text: '✅ Neko commands are now disabled in this group.' }, { quoted: msg });
    }
    if (!isGroup || !nekoGroups.isGroupEnabled(chatId)) {
      return sock.sendMessage(chatId, { text: `❌ Safe Neko commands are disabled here. Group admins can enable with ${prefix()}neko on.` }, { quoted: msg });
    }
    try {
      if (!requested || ['list', 'categories', 'help'].includes(requested)) return sendCategoryList(sock, msg, chatId);
      const { tagInput, amount } = parseRequest(args);
      const tag = resolveTag(tagInput);
      if (!tag) return sendCategoryList(sock, msg, chatId);
      let results = [], provider = '';
      if (NEKOSBEST_IMAGE_CATEGORIES.has(tag)) {
        try { results = await getNekosBestImages(tag, amount); provider = 'NEKOSBEST'; }
        catch (error) { console.warn(`[NEKO] Safe provider failed: ${error?.message || error}`); }
      }
      if (!results.length) { results = await getWaifuImImages(tag, amount); provider = 'Waifu.im (SFW only)'; }
      if (!results.length) throw new Error('No images returned for this category.');
      return sendImages(sock, msg, chatId, tag, results, provider);
    } catch (error) {
      console.error('[NEKO] Safe command failed:', error?.message || error);
      return sock.sendMessage(chatId, { text: '❌ Neko could not fetch images right now.' }, { quoted: msg });
    }
  },
  _internals: { TAGS, resolveTag, parseRequest },
};
