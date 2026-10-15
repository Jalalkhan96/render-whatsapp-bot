import { downloadContentFromMessage } from '@whiskeysockets/baileys';

/**
 * Looks at a message (and its quoted message, if any) and returns
 * { type: 'image'|'video'|'gif', mediaMessage } for the first supported
 * media found, or null.
 */
export function findMediaInMessage(msg) {
  const direct = msg?.message;
  const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;

  for (const container of [direct, quoted]) {
    if (!container) continue;

    if (container.imageMessage) {
      return { type: 'image', mediaMessage: container.imageMessage };
    }
    if (container.videoMessage) {
      const isGif = !!container.videoMessage.gifPlayback;
      return { type: isGif ? 'gif' : 'video', mediaMessage: container.videoMessage };
    }
  }

  return null;
}

/**
 * Downloads a Baileys media message object into a Buffer.
 * @param {'image'|'video'|'gif'} type
 * @param {object} mediaMessage
 */
export async function downloadMediaBuffer(type, mediaMessage) {
  const streamType = type === 'gif' ? 'video' : type;
  const stream = await downloadContentFromMessage(mediaMessage, streamType);

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  if (!buffer.length) {
    throw new Error('Downloaded media is empty.');
  }
  return buffer;
}
