'use strict';

const {
  searchWeb,
  downloadItemMedia,
  convertGifToMp4,
  sleep,
} = require('../lib/giphyWeb');

const MAX_N = 10;
const COOLDOWN_MS = 4000;
const MAX_CANDIDATES = 60;
const recentByQuery = new Map();
const cooldownByChat = new Map();

function keyFor(query) {
  return String(query || 'random').trim().toLowerCase().replace(/\s+/g, ' ');
}

function recentIds(query) { return recentByQuery.get(keyFor(query)) || []; }

function remember(query, id) {
  const key = keyFor(query);
  const list = recentByQuery.get(key) || [];
  recentByQuery.set(key, [id, ...list.filter((x) => x !== id)].slice(0, 40));
}

function parseArgs(args) {
  const values = Array.isArray(args) ? args.map(String).filter(Boolean) : [];
  let count = 1;
  if (/^\d+$/.test(values[0] || '')) count = Number(values.shift());
  const query = values.join(' ').trim();
  return {
    count: Math.max(1, Math.min(count, MAX_N)),
    query,
    random: !query || query.toLowerCase() === 'random',
  };
}

async function handler(sock, message, args = [], context = {}) {
  const chatId = context.chatId || message.key.remoteJid;
  const { count, query, random } = parseArgs(args);
  const last = cooldownByChat.get(chatId);
  if (last && Date.now() - last < COOLDOWN_MS) return;
  cooldownByChat.set(chatId, Date.now());

  const searchQuery = query || 'random';
  const sentIds = new Set();
  let sent = 0;
  try {
    await sock.sendMessage(chatId, { react: { text: '🔎', key: message.key } }).catch(() => {});

    const candidates = await searchWeb('gif', query, Math.min(MAX_CANDIDATES, Math.max(24, count * 8)), {
      random,
      maxCount: MAX_CANDIDATES,
      trending: true,
    });

    const recentSet = new Set(recentIds(searchQuery));
    const ordered = candidates.filter((item) => !recentSet.has(item.id));
    for (const item of [...ordered, ...candidates]) {
      if (sent >= count) break;
      if (!item?.id || sentIds.has(item.id)) continue;
      sentIds.add(item.id);

      let media;
      try {
        media = await downloadItemMedia('gif', item);
        if (media?.type === 'gif') {
          try {
            const mp4 = await convertGifToMp4(media.buffer);
            media = { ...media, buffer: mp4, type: 'mp4', converted: true };
          } catch (error) {
            console.warn(`[gif] ${item.id}: ${error.message}`);
            continue;
          }
        }
        if (!media || media.type !== 'mp4') continue;
      } catch (error) {
        console.warn(`[gif] ${item.id}: ${error.message}`);
        continue;
      }

      try {
        await sock.sendMessage(chatId, {
          video: media.buffer,
          mimetype: 'video/mp4',
          gifPlayback: true,
          ...(count > 1 ? { caption: `🎞️ GIPHY • ${sent + 1}/${count}${query && !random ? ` • ${query}` : ''}` } : {}),
        }, { quoted: message });
        remember(searchQuery, item.id);
        sent += 1;
      } catch (error) {
        console.warn(`[gif] ${item.id} send failed: ${error.message}`);
      }

      if (count > 1) await sleep(750);
    }

    await sock.sendMessage(chatId, { react: { text: sent ? '✅' : '❌', key: message.key } }).catch(() => {});
    if (!sent) {
      await sock.sendMessage(chatId, { text: '❌ No playable/downloadable GIPHY GIF was found. Try another search.' }, { quoted: message });
    } else if (sent < count) {
      await sock.sendMessage(chatId, { text: `ℹ️ Sent ${sent}/${count}. Unplayable or unavailable GIPHY results were skipped automatically.` }, { quoted: message });
    }
  } catch (error) {
    console.error('[gif]', error);
    await sock.sendMessage(chatId, { text: `❌ GIF search failed: ${error.message || 'Unable to reach GIPHY.'}` }, { quoted: message });
    await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }).catch(() => {});
  }
}

async function stickerHandler(sock, message, args = [], context = {}) {
  const chatId = context.chatId || message.key.remoteJid;
  const values = Array.isArray(args) ? args.map(String).filter(Boolean) : [];
  let count = 1;
  if (/^\d+$/.test(values[0] || '')) count = Math.max(1, Math.min(Number(values.shift()), MAX_N));
  const query = values.join(' ').trim();
  if (!query || query.toLowerCase() === 'random') {
    await sock.sendMessage(chatId, { text: '🧩 Usage: -gifs <name> or -gifs <n> <name>' }, { quoted: message });
    return;
  }

  try {
    await sock.sendMessage(chatId, { react: { text: '🔎', key: message.key } }).catch(() => {});
    const candidates = await searchWeb('sticker', query, Math.min(MAX_CANDIDATES, Math.max(24, count * 8)), { maxCount: MAX_CANDIDATES });
    const { animatedWebpFromBuffer } = require('../lib/sticker');
    let sent = 0;
    const seen = new Set();

    for (const item of candidates) {
      if (sent >= count || seen.has(item.id)) break;
      seen.add(item.id);
      try {
        const media = await downloadItemMedia('sticker', item);
        if (!media) continue;
        let sticker = media.buffer;
        if (media.type !== 'webp') {
          sticker = await animatedWebpFromBuffer(media.buffer, { maxDuration: 6 });
        }
        if (!Buffer.isBuffer(sticker) || sticker.length < 100) continue;
        await sock.sendMessage(chatId, { sticker, isAnimated: true }, { quoted: message });
        sent += 1;
      } catch (error) {
        console.warn(`[gifs] ${item.id}: ${error.message}`);
      }
      if (count > 1) await sleep(750);
    }

    await sock.sendMessage(chatId, { react: { text: sent ? '✅' : '❌', key: message.key } }).catch(() => {});
    if (sent < count) await sock.sendMessage(chatId, { text: `ℹ️ Sent ${sent}/${count} playable stickers.` }, { quoted: message });
  } catch (error) {
    console.error('[gifs]', error);
    await sock.sendMessage(chatId, { text: `❌ Sticker search failed: ${error.message || 'Unable to reach GIPHY.'}` }, { quoted: message });
  }
}

async function clipHandler(sock, message, args = [], context = {}) {
  const chatId = context.chatId || message.key.remoteJid;
  const values = Array.isArray(args) ? args.map(String).filter(Boolean) : [];
  let count = 1;
  let random = false;
  if ((values[0] || '').toLowerCase() === 'random') {
    random = true;
    values.shift();
    if (/^\d+$/.test(values[0] || '')) count = Math.max(1, Math.min(Number(values.shift()), MAX_N));
  } else if (/^\d+$/.test(values[0] || '')) {
    count = Math.max(1, Math.min(Number(values.shift()), MAX_N));
  }
  const query = values.join(' ').trim();
  if (!random && !query) {
    await sock.sendMessage(chatId, { text: '🎥 Usage: -gifc <name> or -gifc <n> <name> or -gifc random <n>' }, { quoted: message });
    return;
  }

  try {
    const candidates = await searchWeb('clip', query, Math.min(MAX_CANDIDATES, Math.max(24, count * 8)), { random, maxCount: MAX_CANDIDATES });
    let sent = 0;
    const seen = new Set();
    for (const item of candidates) {
      if (sent >= count || seen.has(item.id)) break;
      seen.add(item.id);
      try {
        const media = await downloadItemMedia('clip', item);
        if (!media || !['mp4', 'webm'].includes(media.type)) continue;
        await sock.sendMessage(chatId, {
          video: media.buffer,
          mimetype: media.type === 'webm' ? 'video/webm' : 'video/mp4',
          gifPlayback: false,
          caption: `🎥 ${query || 'GIPHY clip'}`,
        }, { quoted: message });
        sent += 1;
      } catch (error) {
        console.warn(`[gifc] ${item.id}: ${error.message}`);
      }
      if (count > 1) await sleep(750);
    }
    if (!sent) throw new Error('No playable/downloadable clip was found');
    if (sent < count) await sock.sendMessage(chatId, { text: `ℹ️ Sent ${sent}/${count} playable clips.` }, { quoted: message });
  } catch (error) {
    console.error('[gifc]', error);
    await sock.sendMessage(chatId, { text: `❌ Clip search failed: ${error.message || 'Unable to reach GIPHY.'}` }, { quoted: message });
  }
}

module.exports = [
  { command: 'gif', aliases: ['g', 'gf', 'giphy', 'searchgif'], category: 'media', description: 'Search GIPHY web and send playable unique GIFs.', usage: '-gif <name> | -gif <n> <name> | -gif random', handler },
  { command: 'gifs', aliases: ['gifsticker', 'gifstickers'], category: 'media', description: 'Search GIPHY web stickers and send playable animated stickers.', usage: '-gifs <name> | -gifs <n> <name>', handler: stickerHandler },
  { command: 'gifc', aliases: ['gclip', 'giphyclip', 'gclips'], category: 'media', description: 'Search GIPHY web clips and send playable clips.', usage: '-gifc <name> | -gifc <n> <name> | -gifc random <n>', handler: clipHandler },
];
