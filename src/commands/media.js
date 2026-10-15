import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { childLogger } from '../utils/logger.js';
import { sendText } from '../whatsapp/client.js';
import { normalizeJid } from '../config.js';

const log = childLogger('media-commands');

function getContextInfo(msg) {
  return msg?.message?.extendedTextMessage?.contextInfo ||
    msg?.message?.imageMessage?.contextInfo ||
    msg?.message?.videoMessage?.contextInfo ||
    msg?.message?.documentMessage?.contextInfo || {};
}

function getTargetJid(msg, explicitArg = '') {
  const ctx = getContextInfo(msg);
  const mentioned = ctx.mentionedJid || [];
  if (mentioned[0]) return mentioned[0];

  const participant = ctx.participant;
  if (participant && participant.includes('@')) return participant;

  const cleaned = String(explicitArg || '').replace(/[^0-9]/g, '');
  if (cleaned.length >= 7) return normalizeJid(cleaned);

  return msg?.key?.participant || msg?.key?.remoteJid || null;
}

function jidLabel(jid) {
  if (!jid) return 'unknown';
  if (jid.endsWith('@g.us')) return jid.replace('@g.us', '');
  return jid.replace('@s.whatsapp.net', '');
}

export async function handleProfilePhoto({ sock, jid, msg, arg }) {
  const target = getTargetJid(msg, arg);
  if (!target || target.endsWith('@g.us')) {
    return '⚠️ Use /pp while replying to a user message, mention a user, or provide a phone number. Example: /pp @user';
  }

  try {
    const url = await sock.profilePictureUrl(target, 'image');
    if (!url) return `⚠️ No profile photo is available for ${jidLabel(target)}.`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Profile photo download failed: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await sock.sendMessage(jid, {
      image: buffer,
      caption: `🖼️ *Profile photo*\nNumber: ${jidLabel(target)}`,
    }, { quoted: msg });

    return null;
  } catch (err) {
    log.warn({ target, err: err.message }, 'Unable to fetch profile photo');
    return '⚠️ I could not retrieve that profile photo. The user may have restricted it, may not have a photo, or WhatsApp may have denied access.';
  }
}

export async function handleProfileInfo({ sock, jid, msg, arg }) {
  const target = getTargetJid(msg, arg);
  if (!target || target.endsWith('@g.us')) {
    return '⚠️ Reply to a user, mention a user, or provide a phone number.';
  }

  try {
    let status = null;
    try {
      const result = await sock.fetchStatus(target);
      status = result?.status || result?.setAt ? result.status : null;
    } catch {
      // WhatsApp may reject status access depending on privacy settings.
    }

    let photo = 'not available';
    try {
      const url = await sock.profilePictureUrl(target, 'image');
      if (url) photo = 'available';
    } catch {
      // Ignore restricted/missing profile photos.
    }

    const number = jidLabel(target);
    return `*User Profile*\nNumber: +${number}\nJID: ${target}\nProfile photo: ${photo}\nStatus: ${status || 'hidden/unavailable'}`;
  } catch (err) {
    log.warn({ target, err: err.message }, 'Profile info lookup failed');
    return '⚠️ Unable to retrieve that profile information.';
  }
}

export function getTargetFromMessage(msg) {
  return getTargetJid(msg);
}
