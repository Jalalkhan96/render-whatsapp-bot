const {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
  isJidGroup,
} = require('@whiskeysockets/baileys');
const { buildInteractiveAdditionalNodes } = require('./interactiveNodes');

// WhatsApp client capability is not reliably exposed by a Baileys message key.
// Use a mobile-safe text transport by default. Native interactive/carousel UI
// can be explicitly enabled for clients that are known to support it.
function useNativeInteractive(options = {}) {
  if (options.nativeInteractive === true) return true;
  if (options.nativeInteractive === false) return false;
  // Native interactive UI is the default: this is the button UI expected by the bot menu.
  // Set ABIX_NATIVE_INTERACTIVE=false only to force the plain-text fallback.
  return String(process.env.ABIX_NATIVE_INTERACTIVE ?? 'true').toLowerCase() !== 'false';
}

function validButtons(buttons) {
  return Array.isArray(buttons)
    ? buttons.filter(button => button?.name && button?.buttonParamsJson)
    : [];
}

function safeButtonLabel(button) {
  try {
    const params = JSON.parse(button.buttonParamsJson || '{}');
    return String(params.display_text || params.title || button.name || 'OPEN').trim();
  } catch {
    return String(button.name || 'OPEN').trim();
  }
}

function safeButtonId(button) {
  try {
    const params = JSON.parse(button.buttonParamsJson || '{}');
    return String(params.id || '').trim();
  } catch {
    return '';
  }
}

function compactText(value, max = 700) {
  const text = String(value || '').replace(/\r/g, '').trim();
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function buildSafeCarouselText({ body, footer, cards }) {
  const sections = [String(body || '').trim()];

  (Array.isArray(cards) ? cards : []).forEach((card, index) => {
    const title = String(card?.header?.title || `Result ${index + 1}`).trim();
    const cardBody = compactText(card?.body || '', 520);
    const cardFooter = String(card?.footer || footer || '').trim();
    const buttons = validButtons(card?.buttons);

    const lines = [
      `╭───〔 ${title} 〕`,
      cardBody,
    ];

    if (cardFooter) lines.push(`└ ${cardFooter}`);

    for (const button of buttons) {
      const label = safeButtonLabel(button);
      const id = safeButtonId(button);
      if (id) lines.push(`• ${label} → ${id}`);
    }

    lines.push('╰───────────────');
    sections.push(lines.filter(Boolean).join('\n'));
  });

  if (footer) sections.push(String(footer).trim());
  return sections.filter(Boolean).join('\n\n');
}


async function sendInteractiveMessage(sock, jid, { header = {}, body, footer, buttons }, options = {}) {
  if (!useNativeInteractive(options)) {
    const fallbackContent = {
      text: [String(body || '').trim(), String(footer || '').trim()].filter(Boolean).join('\n\n'),
    };
    fallbackContent.contextInfo = {};
    return sock.sendMessage(jid, fallbackContent, { quoted: options.quoted || undefined });
  }

  try {
    const interactiveHeader = proto.Message.InteractiveMessage.Header.create({
    title: String(header.title || ''),
    subtitle: String(header.subtitle || ''),
    hasMediaAttachment: Boolean(header.hasMediaAttachment || header.media),
  });
  if (header.media) {
    const media = await prepareWAMessageMedia(
      header.mediaType === 'video'
        ? { video: header.media, gifPlayback: false }
        : { image: header.media },
      { upload: sock.waUploadToServer }
    );
    if (header.mediaType === 'video') interactiveHeader.videoMessage = media.videoMessage;
    else interactiveHeader.imageMessage = media.imageMessage;
  }

  const interactive = proto.Message.InteractiveMessage.create({
    header: interactiveHeader,
    body: proto.Message.InteractiveMessage.Body.create({ text: String(body || '') }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: String(footer || '') }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: validButtons(buttons),
      messageParamsJson: '',
    }),
  });
  const generated = generateWAMessageFromContent(jid, {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
        },
        interactiveMessage: interactive,
      },
    },
  }, { userJid: sock?.user?.id });

  // WhiskeySockets needs the same binary relay nodes that the official
  // WhatsApp client emits for native-flow messages. native carousel gets these
  // automatically through baileys_helper; ABIX builds the message directly,
  // so inject them here. Without them WhatsApp can show:
  // "This message couldn't load. Open the message on your phone to view it."
  const additionalNodes = [
    {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'interactive',
          attrs: {
            type: 'native_flow',
            v: '1',
          },
          content: [
            {
              tag: 'native_flow',
              attrs: {
                v: '9',
                name: 'mixed',
              },
            },
          ],
        },
      ],
    },
  ];

  // Private chats additionally need the bot/biz_bot node. Group chats do not.
  if (!isJidGroup(jid)) {
    additionalNodes.push({
      tag: 'bot',
      attrs: { biz_bot: '1' },
    });
  }

  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes,
  });
  return generated;
  } catch (error) {
    // Native-flow construction is version/client sensitive. Always give the
    // user a usable text response instead of a blank/broken message.
    console.warn(`[INTERACTIVE] Native message failed, using text fallback: ${error.message}`);
    const fallbackContent = {
      text: [String(body || '').trim(), String(footer || '').trim()].filter(Boolean).join('\n\n'),
    };
    fallbackContent.contextInfo = {};
    return sock.sendMessage(jid, fallbackContent, { quoted: options.quoted || undefined });
  }
}

async function sendInteractiveCarousel(sock, jid, { body, footer, cards }, options = {}) {
  if (!useNativeInteractive(options)) {
    const text = buildSafeCarouselText({ body, footer, cards });
    return sock.sendMessage(jid, {
      text,
      contextInfo: {},
    }, { quoted: options.quoted });
  }

  const preparedCards = await Promise.all((Array.isArray(cards) ? cards : []).map(async card => {
    const header = proto.Message.InteractiveMessage.Header.create({
      title: String(card.header?.title || ''),
      subtitle: String(card.header?.subtitle || ''),
      hasMediaAttachment: Boolean(card.header?.media),
    });
    if (card.header?.media) {
      const media = await prepareWAMessageMedia(
        card.header.mediaType === 'video'
          ? { video: card.header.media, gifPlayback: false }
          : { image: card.header.media },
        { upload: sock.waUploadToServer }
      );
      if (card.header.mediaType === 'video') header.videoMessage = media.videoMessage;
      else header.imageMessage = media.imageMessage;
    }
    return {
      header,
      body: proto.Message.InteractiveMessage.Body.create({ text: String(card.body || '') }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: String(card.footer || footer || '') }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: validButtons(card.buttons),
        messageParamsJson: '',
      }),
    };
  }));

  const interactive = proto.Message.InteractiveMessage.create({
    header: proto.Message.InteractiveMessage.Header.create({
      title: '',
      subtitle: '',
      hasMediaAttachment: false,
    }),
    body: proto.Message.InteractiveMessage.Body.create({ text: String(body || '') }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: String(footer || '') }),
    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
      cards: preparedCards,
      messageVersion: 1,
      carouselCardType: 1,
    }),
  });
  try {
    const generated = generateWAMessageFromContent(jid, {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: interactive,
        },
      },
    }, { userJid: sock?.user?.id });

    const additionalNodes = Array.isArray(options.additionalNodes)
      ? [...options.additionalNodes]
      : buildInteractiveAdditionalNodes(jid, true);

    await sock.relayMessage(jid, generated.message, {
      messageId: generated.key.id,
      additionalNodes,
    });
    return generated;
  } catch (error) {
    console.warn(`[INTERACTIVE] Native carousel failed, using text fallback: ${error.message}`);
    return sock.sendMessage(jid, {
      text: buildSafeCarouselText({ body, footer, cards }),
      contextInfo: {},
    }, { quoted: options.quoted });
  }
}

function menuButtons(prefix = '-') {
  return [
    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🏠 MAIN MENU', id: `${prefix}menu` }) },
    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 ALL MENUS', id: `${prefix}allmenu` }) },
  ];
}

async function sendMenuCard(sock, jid, content = {}, options = {}) {
  const media = content.image || content.video || null;
  try {
    return await sendInteractiveCarousel(sock, jid, {
      body: String(options.title || 'ABIX MENU'),
      footer: String(options.footer || 'ABIX • Select an option'),
      cards: [{
        header: {
          title: String(options.title || 'ABIX MENU'),
          media,
          mediaType: content.video ? 'video' : 'image',
        },
        body: String(content.text || content.caption || ''),
        footer: String(options.footer || 'ABIX • Select an option'),
        buttons: options.buttons || menuButtons(options.prefix || '-'),
      }],
    }, options);
  } catch (error) {
    console.error('[MENU] Interactive send failed:', error.message);
    return sock.sendMessage(jid, { text: String(content.text || content.caption || ''), contextInfo: {} }, options);
  }
}

function getInteractiveId(message) {
  const content = message?.message || {};
  const native = content.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (native?.paramsJson) {
    try {
      const params = JSON.parse(native.paramsJson);
      const nested = params.buttonParamsJson ? JSON.parse(params.buttonParamsJson) : params;
      return nested.id || nested.selectedId || nested.selected_id || nested.singleSelectId ||
        nested.single_select_id || nested.buttonId || nested.button_id || nested.actionId ||
        nested.rowId || nested.selectedRowId || nested.selected_row_id || null;
    } catch {}
  }
  return content.buttonsResponseMessage?.selectedButtonId ||
    content.listResponseMessage?.singleSelectReply?.selectedRowId ||
    content.templateButtonReplyMessage?.selectedId ||
    content.interactiveResponseMessage?.nativeFlowResponseMessage?.name || null;
}

function normalizeInteraction(message) {
  const content = message?.message || {};
  const actionId = getInteractiveId(message);
  let type = null;
  if (content.buttonsResponseMessage) type = 'button';
  else if (content.templateButtonReplyMessage) type = 'template';
  else if (content.listResponseMessage) type = 'list';
  else if (content.interactiveResponseMessage) type = 'interactive';
  if (!actionId && !type) return null;

  return {
    type: type || 'unknown',
    actionId,
    chatId: message?.key?.remoteJid || null,
    senderId: message?.key?.participant || message?.key?.remoteJid || null,
    sessionId: actionId ? String(actionId).split(/\s+/).find(part => /^tt[a-z0-9]+$/i.test(part)) || null : null,
  };
}


/**
 * Main-menu-only native quick replies.
 *
 * The actual menu media is sent with a normal image/video message. These
 * controls are sent separately using a direct native-flow relay with the MD
 * compatibility envelope used by current helper implementations. No
 * view-once wrapper or forwarded/channel metadata is added.
 */
async function sendMainMenuButtons(sock, jid, options = {}) {
  const prefix = String(options.prefix || '-');
  const buttons = Array.isArray(options.buttons) && options.buttons.length
    ? options.buttons
    : [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 MENU', id: 'menu_categories' }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📚 ALL MENU', id: 'menu_all' }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👥 GROUP', id: 'menu_group' }) },
      ];

  try {
    const userJid = sock?.authState?.creds?.me?.id || sock?.user?.id;
    const interactive = proto.Message.InteractiveMessage.create({
      header: proto.Message.InteractiveMessage.Header.create({
        title: String(options.title || 'ABIX-AE • MAIN MENU'),
        subtitle: '',
        hasMediaAttachment: false,
      }),
      body: proto.Message.InteractiveMessage.Body.create({
        text: 'Choose a menu option:',
      }),
      footer: proto.Message.InteractiveMessage.Footer.create({
        text: String(options.footer || 'TEAM ABIX'),
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons,
        messageParamsJson: '',
      }),
    });

    // Send the native-flow buttons as a direct InteractiveMessage. Do not wrap
    // them in documentWithCaptionMessage/view-once/forwarded envelopes: those
    // wrappers are not needed for quick-reply controls and can cause the
    // WhatsApp client to hide the buttons or report an unsupported message.
    const generated = generateWAMessageFromContent(
      jid,
      {
        interactiveMessage: interactive,
      },
      {
        logger: sock?.logger,
        userJid,
        quoted: options.quoted || undefined,
      }
    );

    const additionalNodes = buildInteractiveAdditionalNodes(jid, true);

    await sock.relayMessage(jid, generated.message, {
      messageId: generated.key.id,
      additionalNodes,
    });

    return generated;
  } catch (error) {
    console.warn(`[MENU] Native buttons unavailable, using command fallback: ${error.message}`);
    const fallbackButtons = buttons.map((button) => {
      try {
        const params = JSON.parse(button.buttonParamsJson || '{}');
        return `• ${params.display_text || 'OPEN'} → ${params.id || ''}`.trim();
      } catch {
        return '• OPEN';
      }
    });
    return sock.sendMessage(jid, {
      text: ['📋 MENU ACTIONS', '', ...fallbackButtons].join('\n'),
      contextInfo: {},
      _skipMenuCard: true,
    }, { quoted: options.quoted || undefined });
  }
}

module.exports = {
  sendInteractiveMessage,
  sendInteractiveCarousel,
  sendMenuCard,
  menuButtons,
  getInteractiveId,
  normalizeInteraction,
  useNativeInteractive,
  buildSafeCarouselText,
  buildInteractiveAdditionalNodes,
  sendMainMenuButtons,
};
