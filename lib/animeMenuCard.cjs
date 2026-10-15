'use strict';
const { sendRandomCard } = require('./animeCard.cjs');

const lastSent = new Map();
const DUPLICATE_GUARD_MS = 1800;

async function maybeSendMenuCard(sock, message, context, menuCommand) {
  const jid = context?.chatId || message?.key?.remoteJid;
  if (!jid || !sock) return false;
  const now = Date.now();
  const previous = lastSent.get(jid) || 0;
  if (now - previous < DUPLICATE_GUARD_MS) return false;
  lastSent.set(jid, now);
  try {
    await sendRandomCard(sock, jid, message, { menuCommand });
    return true;
  } catch (error) {
    console.warn(`[ANIME-CARD] menu card failed for ${menuCommand}: ${error.message}`);
    return false;
  }
}

module.exports = { maybeSendMenuCard };
