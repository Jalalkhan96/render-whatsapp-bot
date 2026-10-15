const fs = require('fs');

let btns = null;
try {
  btns = require('my-md-btns');
} catch (error) {
  console.warn('[MEDIA-EXTRAS] my-md-btns unavailable; native/fallback modes enabled:', error.message);
}

function pickFunction(names) {
  for (const name of names) {
    if (typeof btns?.[name] === 'function') return btns[name].bind(btns);
  }
  return null;
}

function stringifyCell(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

function renderTextTable(payload = {}) {
  const rows = Array.isArray(payload.table) ? payload.table : [];
  if (!rows.length) return String(payload.title || payload.headerText || 'Table');
  const width = Math.min(36, Math.max(...rows.map(row => Array.isArray(row) ? row.length : 0)));
  const normalized = rows.map(row => Array.from({ length: width }, (_, i) => stringifyCell(row?.[i])));
  const sizes = Array.from({ length: width }, (_, c) => Math.min(24, Math.max(...normalized.map(r => r[c].length), 3)));
  const line = `├${sizes.map(n => '─'.repeat(n + 2)).join('┼')}┤`;
  const makeRow = row => `│ ${row.map((cell, i) => cell.slice(0, sizes[i]).padEnd(sizes[i], ' ')).join(' │ ')} │`;
  const out = [];
  if (payload.headerText) out.push(`📊 ${payload.headerText}`);
  if (payload.title) out.push(`*${payload.title}*`);
  out.push(`┌${sizes.map(n => '─'.repeat(n + 2)).join('┬')}┐`);
  normalized.forEach((row, i) => {
    out.push(makeRow(row));
    if (i === 0 && normalized.length > 1) out.push(line);
  });
  out.push(`└${sizes.map(n => '─'.repeat(n + 2)).join('┴')}┘`);
  if (payload.footerText) out.push(String(payload.footerText));
  return out.join('\n');
}

async function callFlexible(fn, sock, jid, payload, options = {}) {
  const attempts = [
    () => fn(sock, jid, payload, options),
    () => fn(sock, jid, payload),
    () => fn({ sock, jid, ...payload }, options),
    () => fn({ sock, jid, ...payload }),
  ];
  let last;
  for (const attempt of attempts) {
    try { return await attempt(); } catch (error) { last = error; }
  }
  throw last || new Error('Helper call failed');
}

async function sendTable(sock, jid, payload, options = {}) {
  const fn = pickFunction(['sendTable', 'sendDataTable', 'sendTableMessage']);
  if (fn) {
    try { return await callFlexible(fn, sock, jid, payload, options); } catch (error) {
      console.warn('[MEDIA-EXTRAS] sendTable helper failed; fallback:', error.message);
    }
  }
  return sock.sendMessage(jid, { text: renderTextTable(payload) }, options);
}

async function sendSpoiler(sock, jid, content, options = {}) {
  const fn = pickFunction(['sendSpoiler', 'sendSpoilerMessage', 'spoiler']);
  if (fn) {
    try { return await callFlexible(fn, sock, jid, { content }, options); } catch (error) {
      console.warn('[MEDIA-EXTRAS] spoiler helper failed; native attempt:', error.message);
    }
  }

  // Some Baileys forks expose spoiler on the content object; official
  // WhiskeySockets Baileys may reject it, so always keep a visible fallback.
  try {
    return await sock.sendMessage(jid, { ...content, spoiler: true }, options);
  } catch (error) {
    const text = content?.text || content?.caption || 'Media';
    return sock.sendMessage(jid, {
      text: `🙈 *SPOILER*\n${text}`,
    }, options);
  }
}

async function sendStickerPack(sock, jid, payload, options = {}) {
  const helper = pickFunction(['sendStickerPack', 'sendStickerPackMessage', 'sendPack']);
  if (helper) {
    try {
      return await callFlexible(helper, sock, jid, payload, options);
    } catch (error) {
      console.warn('[MEDIA-EXTRAS] sticker-pack helper failed; native attempt:', error.message);
    }
  }

  // Dedicated helper methods from enhanced Baileys forks, if present.
  if (typeof sock.sendStickerPack === 'function') {
    return sock.sendStickerPack(jid, payload, options);
  }

  // sendMessage(stickerPack) is supported by some modern Baileys forks.
  try {
    return await sock.sendMessage(jid, { stickerPack: payload }, options);
  } catch (error) {
    if (!Array.isArray(payload?.stickers) || payload.stickers.length === 0) throw error;

    // Preserve all content with the official WhiskeySockets stack by falling
    // back to individual sticker messages only after the full pack is ready.
    let sent = 0;
    for (const sticker of payload.stickers) {
      const data = sticker?.data ?? sticker;
      if (!data) continue;
      await sock.sendMessage(jid, {
        sticker: Buffer.isBuffer(data) ? data : (data?.url ? { url: data.url } : data),
      }, options);
      sent++;
    }
    return { fallbackIndividual: true, sent };
  }
}

function fileBackedSticker(filePath, emojis = []) {
  return { data: fs.readFileSync(filePath), emojis };
}

module.exports = { sendTable, renderTextTable, sendSpoiler, sendStickerPack, fileBackedSticker, hasMyMdButtons: Boolean(btns) };
