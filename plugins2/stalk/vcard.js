function clean(value, fallback = '') {
  return String(value ?? fallback).replace(/[\r\n\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function phoneFromArgs(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 5 ? digits : '';
}

function vcard(name, phone) {
  const safeName = clean(name, 'WhatsApp User').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${safeName};;;`,
    `FN:${safeName}`,
    phone ? `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}` : '',
    phone ? 'item1.X-ABLabel:WhatsApp' : '',
    'END:VCARD',
  ].filter(Boolean).join('\n');
}

module.exports = {
  command: 'vcard',
  aliases: ['contactcard', 'contact'],
  category: 'stalk',
  description: 'Send a native WhatsApp contact card',
  usage: '.vcard <name> <number>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    if (args.length < 2) {
      return sock.sendMessage(chatId, {
        _noChannelContext: true,
        text: '⚡ Format: .vcard Jalal 923001234567',
      }, { quoted: message });
    }

    const phone = phoneFromArgs(args.at(-1));
    const name = clean(args.slice(0, -1).join(' '));
    if (!name || !phone) {
      return sock.sendMessage(chatId, {
        _noChannelContext: true,
        text: '⚡ Format: .vcard Jalal 923001234567',
      }, { quoted: message });
    }

    let jpegThumbnail;
    try {
      if (typeof sock.profilePictureUrl === 'function') {
        const jid = `${phone}@s.whatsapp.net`;
        let url = null;
        try { url = await sock.profilePictureUrl(jid, 'preview'); } catch {}
        if (!url) {
          try { url = await sock.profilePictureUrl(jid, 'image'); } catch {}
        }
        if (url) {
          const response = await fetch(url);
          if (response.ok) jpegThumbnail = Buffer.from(await response.arrayBuffer());
        }
      }
    } catch {}

    const contact = {
      displayName: name,
      vcard: vcard(name, phone),
    };
    if (jpegThumbnail?.length) contact.jpegThumbnail = jpegThumbnail;

    return sock.sendMessage(chatId, {
      _noChannelContext: true,
      contacts: {
        displayName: name,
        contacts: [contact],
      },
    }, { quoted: message });
  },
};
