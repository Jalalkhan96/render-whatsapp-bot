const isOwner = require('../lib/isOwner');

const CHANNEL_JID = process.env.NEWSLETTER_JID || '120363413637544342@newsletter';
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbE7AW8GOj9rTFZnej0y';

const FAKE_FORWARD = {
  forwardingScore: 1,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: CHANNEL_JID,
    newsletterName: 'ABIX-AE',
    serverMessageId: -1
  }
};

module.exports = {
  command: 'sendtochannel',
  aliases: ['stc', 'fc', 'forwardchannel', 'channelforward'],
  category: 'tools',
  description: 'Reply to any message to forward it directly to ABIX-AE channel (Admin only)',
  usage: '.stc (reply to any message)',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const senderId = message.key.participant || message.key.remoteJid;

    // ── Admin Check ──────────────────────────────────────────
    const isOwner = await isOwner(senderId, sock, chatId);
    if (!isOwner) {
      return sock.sendMessage(chatId, {
        text: `❌ *Sirf Admin is command use kar sakta hai!*\n_Only Admin can use this command._`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    // ── Get Quoted Message ────────────────────────────────────
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = contextInfo?.quotedMessage;

    if (!quotedMsg) {
      return sock.sendMessage(chatId, {
        text: `❌ *Kisi message ko reply karo!*\n_Please reply to the message you want to forward to the channel._\n\nUsage: Kisi bhi message ko reply kar ke \`.stc\` likho`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    // ── Build the message to forward ──────────────────────────
    const quotedText = quotedMsg.conversation
      || quotedMsg.extendedTextMessage?.text
      || quotedMsg.imageMessage?.caption
      || quotedMsg.videoMessage?.caption
      || quotedMsg.documentMessage?.caption
      || null;

    const hasImage   = !!quotedMsg.imageMessage;
    const hasVideo   = !!quotedMsg.videoMessage;
    const hasAudio   = !!quotedMsg.audioMessage;
    const hasSticker = !!quotedMsg.stickerMessage;
    const hasDoc     = !!quotedMsg.documentMessage;

    // Optional extra caption from args: .stc My cool caption
    const extraCaption = args.join(' ').trim();
    const finalCaption = extraCaption
      ? `${extraCaption}\n\n━━━━━━━━━━━━━━━━━━━\n📢 *Join ABIX-AE Channel:*\n👉 ${CHANNEL_LINK}`
      : `━━━━━━━━━━━━━━━━━━━\n📢 *ABIX-AE Channel se:*\n👉 ${CHANNEL_LINK}`;

    try {
      await sock.sendPresenceUpdate('composing', chatId);

      // ── Text Message ────────────────────────────────────────
      if (quotedText && !hasImage && !hasVideo && !hasAudio) {
        const textToSend = `${quotedText}\n\n${finalCaption}`;

        await sock.sendMessage(CHANNEL_JID, {
          text: textToSend,
          contextInfo: FAKE_FORWARD
        });

      // ── Image Message ───────────────────────────────────────
      } else if (hasImage) {
        const imgUrl = quotedMsg.imageMessage?.url;
        const caption = quotedMsg.imageMessage?.caption || '';
        const textCaption = `${caption}\n\n${finalCaption}`.trim();

        await sock.sendMessage(CHANNEL_JID, {
          image: { url: imgUrl },
          caption: textCaption,
          contextInfo: FAKE_FORWARD
        });

      // ── Video Message ───────────────────────────────────────
      } else if (hasVideo) {
        const vidUrl = quotedMsg.videoMessage?.url;
        const caption = quotedMsg.videoMessage?.caption || '';
        const textCaption = `${caption}\n\n${finalCaption}`.trim();

        await sock.sendMessage(CHANNEL_JID, {
          video: { url: vidUrl },
          caption: textCaption,
          contextInfo: FAKE_FORWARD
        });

      // ── Audio Message ───────────────────────────────────────
      } else if (hasAudio) {
        const audioUrl = quotedMsg.audioMessage?.url;
        await sock.sendMessage(CHANNEL_JID, {
          audio: { url: audioUrl },
          mimetype: 'audio/mp4',
          contextInfo: FAKE_FORWARD
        });
        // Send caption separately
        await sock.sendMessage(CHANNEL_JID, {
          text: finalCaption,
          contextInfo: FAKE_FORWARD
        });

      // ── Sticker Message ─────────────────────────────────────
      } else if (hasSticker) {
        const stickerUrl = quotedMsg.stickerMessage?.url;
        await sock.sendMessage(CHANNEL_JID, {
          sticker: { url: stickerUrl },
          contextInfo: FAKE_FORWARD
        });

      // ── Document Message ────────────────────────────────────
      } else if (hasDoc) {
        const docUrl = quotedMsg.documentMessage?.url;
        const mimetype = quotedMsg.documentMessage?.mimetype || 'application/octet-stream';
        const fileName = quotedMsg.documentMessage?.fileName || 'file';

        await sock.sendMessage(CHANNEL_JID, {
          document: { url: docUrl },
          mimetype,
          fileName,
          caption: finalCaption,
          contextInfo: FAKE_FORWARD
        });

      } else {
        return sock.sendMessage(chatId, {
          text: `❌ *Yeh message type support nahi hai.*\n_Text, Image, Video, Audio, ya Document wala message reply karo._`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
      }

      // ── Confirmation to Admin ───────────────────────────────
      await sock.sendMessage(chatId, {
        text:
          `✅ *Channel par Successfully Bhej Diya!*\n\n` +
          `📢 *Channel:* ABIX-AE\n` +
          `🔗 *Link:* ${CHANNEL_LINK}\n\n` +
          `_Message with fake-forward tag channel par post ho gaya!_ ✨`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });

    } catch (error) {
      console.error('sendtochannel error:', error.message);
      await sock.sendMessage(chatId, {
        text: `❌ *Forward karne mein error aaya:*\n${error.message}`,
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }
  }
};
