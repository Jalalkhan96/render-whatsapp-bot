const MAX_PFP_BYTES = 512 * 1024;
const PROFILE_BATCH = 5;
const SEND_DELAY_MS = 180;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/[\r\n\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeVCard(value) {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function normalizePhone(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/(?:^|@)\+?([0-9]{5,20})(?:@|$)/);
  if (match) return match[1];
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 5 && digits.length <= 20 ? digits : '';
}

function participantJid(participant = {}) {
  return participant.id || participant.jid || participant.phoneNumber || '';
}

function contactRecord(sock, participant) {
  const jid = participantJid(participant);
  const phone = normalizePhone(participant.phoneNumber) || normalizePhone(jid);
  const storeContacts = sock?.store?.contacts || {};
  const alternatives = [
    jid,
    participant.phoneNumber,
    participant.lid,
  ].filter(Boolean);

  let stored = null;
  for (const key of alternatives) {
    if (storeContacts[key]) {
      stored = storeContacts[key];
      break;
    }
  }

  const name = cleanText(
    participant.notify ||
    participant.name ||
    participant.pushName ||
    stored?.name ||
    stored?.notify ||
    stored?.verifiedName ||
    (phone ? `WhatsApp User ${phone}` : jid || 'WhatsApp User')
  );

  return { jid, phone, name };
}

function buildVCard({ name, phone }) {
  const safeName = escapeVCard(name || 'WhatsApp User');
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${safeName};;;`,
    `FN:${safeName}`,
    'ORG:MYBOT',
  ];

  if (phone) {
    lines.push(`TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}`);
    lines.push('item1.X-ABLabel:WhatsApp');
  }

  lines.push('END:VCARD');
  return lines.join('\n');
}

async function fetchThumbnail(sock, primaryJid, alternateJid = '') {
  if (typeof sock?.profilePictureUrl !== 'function') return null;

  const jids = [...new Set([primaryJid, alternateJid].filter(Boolean))];
  for (const jid of jids) {
    for (const type of ['preview', 'image']) {
      let url = null;
      try {
        url = await sock.profilePictureUrl(jid, type);
      } catch {
        continue;
      }
      if (!url) continue;

      try {
        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok) continue;
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length || buffer.length > MAX_PFP_BYTES) continue;
        return buffer;
      } catch {
        // Try the next profile-picture representation/JID.
      }
    }
  }
  return null;
}

async function sendNativeContact(sock, chatId, participant, record, thumbnail) {
  const contact = {
    displayName: record.name,
    vcard: buildVCard(record),
  };

  if (thumbnail) {
    // ContactMessage's jpegThumbnail is serialized as bytes by Baileys.
    contact.jpegThumbnail = thumbnail;
  }

  await sock.sendMessage(chatId, {
    _noChannelContext: true,
    contacts: {
      displayName: record.name,
      contacts: [contact],
    },
  });
}

module.exports = {
  command: 'vbot',
  aliases: ['vb', 'groupvcard', 'groupcards'],
  category: 'tools',
  description: 'Send a native WhatsApp contact card for every group member with their profile photo',
  usage: '-vbot',
  groupOnly: true,
  adminOnly: true,
  cooldown: 3000,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message?.key?.remoteJid;

    if (!chatId || !String(chatId).endsWith('@g.us')) {
      return sock.sendMessage(chatId || message?.key?.remoteJid, {
        _noChannelContext: true,
        text: '❌ -vbot can only be used inside a group.',
      }, { quoted: message });
    }

    if (typeof sock.groupMetadata !== 'function') {
      return sock.sendMessage(chatId, {
        _noChannelContext: true,
        text: '❌ Group metadata is not available on this connection.',
      }, { quoted: message });
    }

    let metadata;
    try {
      metadata = await sock.groupMetadata(chatId);
    } catch (error) {
      return sock.sendMessage(chatId, {
        _noChannelContext: true,
        text: `❌ Could not read group members: ${error.message}`,
      }, { quoted: message });
    }

    const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
    if (!participants.length) {
      return sock.sendMessage(chatId, {
        _noChannelContext: true,
        text: '❌ No group members found.',
      }, { quoted: message });
    }

    const groupName = cleanText(metadata.subject, 'Group');
    await sock.sendMessage(chatId, {
      _noChannelContext: true,
      text: `👥 *${groupName}*\n🪪 Sending native vCards for *${participants.length}* members…`,
    }, { quoted: message });

    let sent = 0;
    let withoutPfp = 0;
    let failed = 0;

    // Resolve profile pictures in small concurrent batches, but send the
    // actual native contact cards one-by-one so WhatsApp renders each member
    // as an individual ContactMessage rather than a downloadable .vcf file.
    for (let i = 0; i < participants.length; i += PROFILE_BATCH) {
      const batch = participants.slice(i, i + PROFILE_BATCH);
      const resolved = await Promise.all(batch.map(async participant => {
        const record = contactRecord(sock, participant);
        const thumbnail = await fetchThumbnail(sock, record.jid, participant.phoneNumber);
        return { participant, record, thumbnail };
      }));

      for (const entry of resolved) {
        try {
          await sendNativeContact(sock, chatId, entry.participant, entry.record, entry.thumbnail);
          sent += 1;
          if (!entry.thumbnail) withoutPfp += 1;
        } catch (error) {
          failed += 1;
          console.error(`[VBOT] Failed to send ${entry.record.name}:`, error.message);
        }
        await sleep(SEND_DELAY_MS);
      }
    }

    return sock.sendMessage(chatId, {
      _noChannelContext: true,
      text:
        `✅ *VBOT complete*\n` +
        `👥 Members: ${participants.length}\n` +
        `🪪 Cards sent: ${sent}\n` +
        `🖼️ No PFP available: ${withoutPfp}\n` +
        `⚠️ Failed: ${failed}`,
    });
  },
};
