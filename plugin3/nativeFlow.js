'use strict';

/**
 * Isolated WhatsApp Native-Flow builders for plugin3 experiments.
 * No existing ABIX-AE files are modified by this package.
 */

function configuredPrefix() {
  try {
    return require('../settings').prefixes[0] || process.env.BOT_PREFIX || '۞';
  } catch {
    return process.env.BOT_PREFIX || '۞';
  }
}

function normalizeActionId(id) {
  const value = String(id ?? '');
  // Supplied demo styles use '-' as a documentation prefix. Translate only
  // those command-like IDs to the bot's active prefix; leave action IDs alone.
  if (value.startsWith('-')) return configuredPrefix() + value.slice(1);
  return value;
}

function jsonButton(name, params) {
  const payload = { ...params };
  if (typeof payload.id === 'string') payload.id = normalizeActionId(payload.id);
  return {
    name,
    buttonParamsJson: JSON.stringify(payload),
  };
}

function makeQuickReply(displayText, id) {
  return jsonButton('quick_reply', {
    display_text: String(displayText),
    id: String(id),
  });
}

function makeSingleSelect(title, sections) {
  return jsonButton('single_select', {
    title: String(title),
    sections: Array.isArray(sections) ? sections : [],
  });
}

function makeUrl(displayText, url, merchantUrl = url) {
  return jsonButton('cta_url', {
    display_text: String(displayText),
    url: String(url),
    merchant_url: String(merchantUrl),
  });
}

function makeCopy(displayText, copyCode, id = 'copy_code') {
  return jsonButton('cta_copy', {
    display_text: String(displayText),
    id: String(id),
    copy_code: String(copyCode),
  });
}

function makeCall(displayText, phoneNumber) {
  return jsonButton('cta_call', {
    display_text: String(displayText),
    phone_number: String(phoneNumber),
  });
}

function buildHeader({ title = '', subtitle = '', media = null } = {}) {
  const header = {
    title: String(title),
    subtitle: String(subtitle),
    hasMediaAttachment: Boolean(media),
  };

  if (media?.type === 'image') {
    header.imageMessage = media.message || media.imageMessage || {};
  } else if (media?.type === 'video') {
    header.videoMessage = media.message || media.videoMessage || {};
  }

  return header;
}

function buildNativeFlowContent({
  title,
  subtitle = '',
  body = '',
  footer = '',
  buttons = [],
  media = null,
  messageParams = '',
} = {}) {
  return {
    header: buildHeader({ title, subtitle, media }),
    body: { text: String(body) },
    footer: { text: String(footer) },
    nativeFlowMessage: {
      buttons: Array.isArray(buttons) ? buttons : [],
      messageParamsJson:
        typeof messageParams === 'string'
          ? messageParams
          : JSON.stringify(messageParams || {}),
    },
  };
}

function buildCarouselContent({ body = '', footer = '', cards = [] } = {}) {
  return {
    body: { text: String(body) },
    footer: { text: String(footer) },
    carouselMessage: {
      cards: Array.isArray(cards) ? cards : [],
    },
  };
}

function makeCarouselCard({ title = '', body = '', footer = '', buttons = [], media = null } = {}) {
  return {
    header: buildHeader({ title, media }),
    body: { text: String(body) },
    footer: { text: String(footer) },
    nativeFlowMessage: {
      buttons: Array.isArray(buttons) ? buttons : [],
      messageParamsJson: '',
    },
  };
}

function getBaileys() {
  return require('@whiskeysockets/baileys');
}

/**
 * Convert the plain interactive content into Baileys protobuf messages.
 * Only the mainstream single-message native-flow path is sent here.
 */
async function sendNativeFlow(sock, jid, content, options = {}) {
  if (!sock || typeof sock.relayMessage !== 'function') {
    throw new TypeError('A valid Baileys socket with relayMessage() is required.');
  }

  const { generateWAMessageFromContent, proto } = getBaileys();

  const headerData = content.header || {};
  const header = proto.Message.InteractiveMessage.Header.create({
    title: String(headerData.title || ''),
    subtitle: String(headerData.subtitle || ''),
    hasMediaAttachment: Boolean(headerData.hasMediaAttachment),
    ...(headerData.imageMessage ? { imageMessage: headerData.imageMessage } : {}),
    ...(headerData.videoMessage ? { videoMessage: headerData.videoMessage } : {}),
  });

  const interactive = proto.Message.InteractiveMessage.create({
    header,
    body: proto.Message.InteractiveMessage.Body.create({
      text: String(content.body?.text || ''),
    }),
    footer: proto.Message.InteractiveMessage.Footer.create({
      text: String(content.footer?.text || ''),
    }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: Array.isArray(content.nativeFlowMessage?.buttons)
        ? content.nativeFlowMessage.buttons
        : [],
      messageParamsJson: String(content.nativeFlowMessage?.messageParamsJson || ''),
    }),
  });

  const generated = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: interactive,
        },
      },
    },
    {
      userJid: sock?.user?.id,
      quoted: options.quoted,
    }
  );

  const additionalNodes = options.additionalNodes || [
    {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'interactive',
          attrs: { type: 'native_flow', v: '1' },
          content: [
            {
              tag: 'native_flow',
              attrs: { v: '9', name: 'mixed' },
            },
          ],
        },
      ],
    },
  ];

  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes,
  });

  return generated;
}

module.exports = {
  jsonButton,
  makeQuickReply,
  makeSingleSelect,
  makeUrl,
  makeCopy,
  makeCall,
  buildHeader,
  buildNativeFlowContent,
  makeCarouselCard,
  buildCarouselContent,
  sendNativeFlow,
};
