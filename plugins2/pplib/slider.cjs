'use strict';
/**
 * pplib/slider.cjs — native WhatsApp swipeable carousel (slider) sender.
 *
 * Same recipe as the bot's own wa-trick-carousel.cjs, inlined here so the
 * PP plugins don't depend on external paths:
 *   - generateWAMessageContent({ image:{ url } }, { upload: sock.waUploadToServer })
 *   - card = { header:{ title, hasMediaAttachment:true, imageMessage },
 *              body:{ text }, footer:{ text },
 *              nativeFlowMessage:{ buttons:[quick_reply …] } }
 *   - generateWAMessageFromContent(jid, { viewOnceMessage:{ message:{
 *       interactiveMessage:{ body, footer, carouselMessage:{ cards } } } } }, {})
 *   - sock.relayMessage(jid, content.message, { messageId })
 *
 * IMPORTANT: sending through relayMessage (not the patched sock.sendMessage)
 * means NO fake-forward styling is applied — the slider shows clean.
 *
 * Returns true on success, false when the slider can't be built
 * (baileys missing, no thumbnails, upload failure) — callers fall back
 * to a plain-text list.
 */

function getBaileys(override) {
  if (override) return override;
  try {
    return require('@whiskeysockets/baileys');
  } catch {
    return null;
  }
}

function quickReply(displayText, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: displayText, id }),
  };
}

/**
 * Build carousel cards from items:
 *   items = [{ title, body, footer, imageUrl, buttons:[{text, id}] }]
 */
async function buildCards(sock, baileys, items, maxCards = 8) {
  const { generateWAMessageContent } = baileys;
  const cards = [];
  for (const item of items) {
    if (!item.imageUrl) continue; // cards REQUIRE a media header to render
    let media = null;
    try {
      media = await generateWAMessageContent(
        { image: { url: item.imageUrl } },
        { upload: sock.waUploadToServer }
      );
    } catch {
      continue; // thumbnail upload failed — skip this card
    }
    if (!media || !media.imageMessage) continue;
    cards.push({
      header: {
        title: String(item.title || '').slice(0, 60),
        hasMediaAttachment: true,
        imageMessage: media.imageMessage,
      },
      body: { text: String(item.body || '').slice(0, 300) },
      footer: { text: String(item.footer || '').slice(0, 60) },
      nativeFlowMessage: {
        buttons: (item.buttons || []).map((b) => quickReply(b.text, b.id)),
      },
    });
    if (cards.length >= maxCards) break;
  }
  return cards;
}

/**
 * Send the slider. opts = { bodyText, footerText, items }.
 * No quoted message, no forwarding contextInfo — fake-forward stays OFF.
 */
async function sendSlider(sock, chatId, { bodyText, footerText, items, maxCards = 8 }, baileysOverride) {
  const baileys = getBaileys(baileysOverride);
  if (!baileys || typeof sock.relayMessage !== 'function' || typeof sock.waUploadToServer !== 'function') {
    return false;
  }
  const cards = await buildCards(sock, baileys, items, maxCards);
  if (!cards.length) return false;
  const { generateWAMessageFromContent } = baileys;
  const content = await generateWAMessageFromContent(
    chatId,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: bodyText || '' },
            footer: { text: footerText || '' },
            carouselMessage: { cards },
          },
        },
      },
    },
    {}
  );
  await sock.relayMessage(chatId, content.message, { messageId: content.key.id });
  return true;
}

module.exports = { sendSlider, buildCards, quickReply, getBaileys };
