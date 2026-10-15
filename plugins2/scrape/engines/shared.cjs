'use strict';

function getJid(message, context) {
  return context?.chatId || message?.key?.remoteJid || null;
}

function getInputText(message, context, args = []) {
  const direct = [
    context?.rawText,
    context?.text,
    context?.body,
    context?.commandText,
    message?.body,
    message?.text,
  ].find((v) => typeof v === 'string' && v.trim());
  if (direct) return direct.trim();
  return Array.isArray(args) ? args.join(' ').trim() : '';
}

function getPrefix(context) {
  return String(context?.prefix || process.env.PREFIX || '-');
}

async function safeText(sock, message, context, text) {
  const jid = getJid(message, context);
  if (!jid) throw new Error('chat id unavailable');
  return sock.sendMessage(jid, { text: String(text) }, { quoted: message });
}

async function sendImage(sock, message, context, url, extra = {}) {
  const jid = getJid(message, context);
  if (!jid) throw new Error('chat id unavailable');
  return sock.sendMessage(jid, { image: { url: String(url) }, ...extra });
}

async function sendVideo(sock, message, context, url, extra = {}) {
  const jid = getJid(message, context);
  if (!jid) throw new Error('chat id unavailable');
  return sock.sendMessage(jid, { video: { url: String(url) }, ...extra });
}

async function sendAudio(sock, message, context, url, mimetype = 'audio/mpeg') {
  const jid = getJid(message, context);
  if (!jid) throw new Error('chat id unavailable');
  return sock.sendMessage(jid, { audio: { url: String(url) }, mimetype, ptt: false });
}

function clampCount(value, fallback, max = 10) {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, n));
}

function isUrl(s) {
  try { return /^https?:$/i.test(new URL(String(s)).protocol); } catch { return false; }
}

module.exports = {
  getJid,
  getInputText,
  getPrefix,
  safeText,
  sendImage,
  sendVideo,
  sendAudio,
  clampCount,
  isUrl,
};
