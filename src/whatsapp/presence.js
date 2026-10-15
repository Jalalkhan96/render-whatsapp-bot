import { childLogger } from '../utils/logger.js';

const log = childLogger('presence');

export async function withTypingIndicator(sock, jid, fn) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
  } catch (err) {
    log.debug({ err: err.message }, 'Failed to set typing presence (non-fatal)');
  }

  try {
    return await fn();
  } finally {
    try {
      await sock.sendPresenceUpdate('paused', jid);
    } catch (err) {
      log.debug({ err: err.message }, 'Failed to clear typing presence (non-fatal)');
    }
  }
}
