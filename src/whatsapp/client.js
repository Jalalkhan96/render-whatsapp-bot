import { splitMessage } from '../utils/splitter.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('client');

/**
 * Sends a (possibly long) text response to a JID, splitting into
 * WhatsApp-friendly chunks and sending them sequentially with a small
 * delay to avoid flooding.
 */
export async function sendLongMessage(sock, jid, text) {
  const chunks = splitMessage(text);

  for (let i = 0; i < chunks.length; i += 1) {
    try {
      await sock.sendMessage(jid, { text: chunks[i] });
    } catch (err) {
      log.error({ jid, err: err.message, chunk: i }, 'Failed to send message chunk');
      throw err;
    }
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
}

export async function sendText(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
  } catch (err) {
    log.error({ jid, err: err.message }, 'Failed to send message');
    throw err;
  }
}
