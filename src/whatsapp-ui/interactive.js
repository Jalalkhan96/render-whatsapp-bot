import {
  generateWAMessageFromContent,
  proto,
  prepareWAMessageMedia,
} from '@whiskeysockets/baileys';

/**
 * ABIX WhatsApp Interactive Message Helper
 *
 * Exports:
 *   sendInteractiveMessage()
 *   sendPlainFallback()
 *
 * Designed for the current menu.js imports.
 */


/**
 * Safely normalize native-flow buttons.
 */
function normalizeButtons(buttons = []) {
  if (!Array.isArray(buttons)) {
    return [];
  }

  return buttons.filter(
    (button) =>
      button &&
      typeof button.name === 'string' &&
      typeof button.buttonParamsJson === 'string'
  );
}


/**
 * Send a native-flow interactive message.
 *
 * Expected input:
 *
 * {
 *   interactiveMessage: {
 *      header: {...},
 *      body: {...},
 *      footer: {...},
 *      nativeFlowMessage: {
 *         buttons: [...]
 *      }
 *   }
 * }
 *
 * This function is intentionally compatible with the
 * existing menu.js format.
 */
export async function sendInteractiveMessage(
  sock,
  jid,
  content = {},
  options = {}
) {
  if (!sock) {
    throw new Error('WhatsApp socket is required.');
  }

  if (!jid) {
    throw new Error('Destination JID is required.');
  }

  const input =
    content?.interactiveMessage || {};

  const inputHeader =
    input?.header || {};

  const inputBody =
    input?.body || {};

  const inputFooter =
    input?.footer || {};

  const inputNativeFlow =
    input?.nativeFlowMessage || {};

  const buttons =
    normalizeButtons(
      inputNativeFlow.buttons
    );

  // ----------------------------------------------------------
  // Header
  // ----------------------------------------------------------

  let header =
    proto.Message.InteractiveMessage.Header.create({
      title:
        String(
          inputHeader.title || ''
        ),

      hasMediaAttachment:
        Boolean(
          inputHeader.hasMediaAttachment
        ),
    });


  // ----------------------------------------------------------
  // Optional image
  // ----------------------------------------------------------

  if (
    inputHeader.hasMediaAttachment &&
    inputHeader.imageMessage
  ) {
    header.imageMessage =
      inputHeader.imageMessage;
  }


  // ----------------------------------------------------------
  // Body
  // ----------------------------------------------------------

  const body =
    proto.Message.InteractiveMessage.Body.create({
      text:
        String(
          inputBody.text || ''
        ),
    });


  // ----------------------------------------------------------
  // Footer
  // ----------------------------------------------------------

  const footer =
    proto.Message.InteractiveMessage.Footer.create({
      text:
        String(
          inputFooter.text || ''
        ),
    });


  // ----------------------------------------------------------
  // Native Flow
  // ----------------------------------------------------------

  const nativeFlow =
    proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons,

      messageParamsJson:
        inputNativeFlow.messageParamsJson ||
        '',
    });


  // ----------------------------------------------------------
  // Interactive message
  // ----------------------------------------------------------

  const interactive =
    proto.Message.InteractiveMessage.create({
      header,
      body,
      footer,
      nativeFlowMessage:
        nativeFlow
    });


  // ----------------------------------------------------------
  // Build WhatsApp message
  // ----------------------------------------------------------

  const generated =
    generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },

            interactiveMessage:
              interactive,
          },
        },
      },
      {
        quoted:
          options?.quoted || undefined,

        userJid:
          sock?.user?.id || undefined,
      }
    );


  // ----------------------------------------------------------
  // Relay
  // ----------------------------------------------------------

  await sock.relayMessage(
    jid,
    generated.message,
    {
      messageId:
        generated.key.id,
      additionalNodes:
        options.additionalNodes || [
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
        ],
    }
  );

  return generated;
}


/**
 * Send a plain text fallback.
 */
export async function sendPlainFallback(
  sock,
  jid,
  text,
  options = {}
) {
  if (!sock) {
    throw new Error('WhatsApp socket is required.');
  }

  if (!jid) {
    throw new Error('Destination JID is required.');
  }

  return await sock.sendMessage(
    jid,
    {
      text:
        String(
          text || ''
        ),
      contextInfo: {}
    },
    {
      quoted:
        options?.quoted || undefined,
    }
  );
}


/**
 * Optional helper:
 * prepare an image for use in an interactive header.
 *
 * Usage:
 *
 * const imageMessage =
 *   await prepareInteractiveImage(
 *      sock,
 *      imageBuffer
 *   );
 */
export async function prepareInteractiveImage(
  sock,
  image
) {
  if (!sock?.waUploadToServer) {
    throw new Error(
      'Socket upload function is unavailable.'
    );
  }

  if (!image) {
    throw new Error(
      'Image buffer is required.'
    );
  }

  const media =
    await prepareWAMessageMedia(
      {
        image,
      },
      {
        upload:
          sock.waUploadToServer,
      }
    );

  return media.imageMessage;
}