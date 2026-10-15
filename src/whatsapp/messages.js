/**
 * Extracts plain text content from a Baileys message object, handling the
 * common message types. Returns null for unsupported/non-text types.
 */
export function extractText(message) {
  if (!message) return null;
  const m = message.message;
  if (!m) return null;

  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;

  return null;
}

export function getMessageType(message) {
  const m = message?.message;
  if (!m) return 'unknown';
  if (m.conversation || m.extendedTextMessage) return 'text';
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.documentMessage) return 'document';
  if (m.audioMessage) return 'audio';
  if (m.stickerMessage) return 'sticker';
  if (m.contactMessage) return 'contact';
  if (m.locationMessage) return 'location';
  return 'unknown';
}

export function isGroupJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

export function getQuotedText(message) {
  const ctx = message?.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (!quoted) return null;
  return quoted.conversation || quoted.extendedTextMessage?.text || null;
}

export function isBotMentioned(message, botJid) {
  const ctx = message?.message?.extendedTextMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];
  return mentioned.includes(botJid);
}
