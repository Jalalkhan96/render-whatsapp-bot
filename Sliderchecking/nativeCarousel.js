'use strict';

const fs = require('fs');
const path = require('path');
const {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
} = require('@whiskeysockets/baileys');

function findMedia() {
  const candidates = [
    path.join(process.cwd(), 'assets', 'bot_top.mp4'),
    path.join(__dirname, '..', '..', '..', 'assets', 'bot_top.mp4'),
    path.join(process.cwd(), 'assets', 'slider-banner.mp4'),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function makeCopyButton(displayText, copyCode, id) {
  return {
    name: 'cta_copy',
    buttonParamsJson: JSON.stringify({
      display_text: displayText,
      id,
      copy_code: copyCode,
    }),
  };
}

function makeReplyButton(displayText, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: displayText,
      id,
    }),
  };
}

async function sendSliderCarousel(sock, jid, options = {}) {
  const cards = Array.isArray(options.cards) ? options.cards : [];
  if (!cards.length) throw new Error('At least one slider card is required');

  const preparedCards = [];
  const mediaPath = findMedia();

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const header = proto.Message.InteractiveMessage.Header.create({
      title: String(card.title || `Slider ${i + 1}`),
      subtitle: String(card.footer || ''),
      hasMediaAttachment: Boolean(mediaPath),
    });

    if (mediaPath) {
      const media = await prepareWAMessageMedia(
        { video: { url: mediaPath }, gifPlayback: true },
        { upload: sock.waUploadToServer }
      );
      header.videoMessage = media.videoMessage;
    }

    const buttons = [];
    for (const [index, item] of (card.copyButtons || []).slice(0, 3).entries()) {
      buttons.push(makeCopyButton(item[0], item[1], `slider_copy_${i}_${index}`));
    }

    if (!buttons.length) {
      buttons.push(makeReplyButton('Open', `slider_card_${i}`));
    }

    const nativeFlow = proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons,
      messageParamsJson: JSON.stringify({}),
    });

    const cardMessage = proto.Message.InteractiveMessage.CarouselMessage.Card.create({
      header,
      body: proto.Message.InteractiveMessage.Body.create({
        text: String(card.body || ''),
      }),
      footer: proto.Message.InteractiveMessage.Footer.create({
        text: String(card.footer || ''),
      }),
      nativeFlowMessage: nativeFlow,
    });

    preparedCards.push(cardMessage);
  }

  const interactive = proto.Message.InteractiveMessage.create({
    header: proto.Message.InteractiveMessage.Header.create({
      title: String(options.title || 'Slider Checking'),
      hasMediaAttachment: false,
    }),
    body: proto.Message.InteractiveMessage.Body.create({
      text: String(options.body || 'Swipe to browse.'),
    }),
    footer: proto.Message.InteractiveMessage.Footer.create({
      text: String(options.footer || 'Slider test'),
    }),
    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({
      cards: preparedCards,
      messageVersion: 1,
      carouselCardType: 1,
    }),
  });

  const content = proto.Message.create({ interactiveMessage: interactive });
  const msg = generateWAMessageFromContent(jid, content, {
    userJid: sock.user?.id,
    quoted: options.quoted,
    upload: sock.waUploadToServer,
  });

  await sock.relayMessage(jid, msg.message, {
    messageId: msg.key.id,
    additionalNodes: [
      {
        tag: 'biz',
        attrs: {},
        content: [
          {
            tag: 'interactive',
            attrs: {},
            content: [
              { tag: 'native_flow', attrs: {}, content: [] },
            ],
          },
        ],
      },
    ],
  });

  return msg;
}

module.exports = {
  sendSliderCarousel,
  makeCopyButton,
};
