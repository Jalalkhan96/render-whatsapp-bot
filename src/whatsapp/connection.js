import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { loadAuthState } from './auth.js';
import { childLogger } from '../utils/logger.js';
import pino from 'pino';

const log = childLogger('connection');

// Baileys wants its own pino logger instance (not our pretty one) to avoid noisy internal logs.
const baileysLogger = pino({ level: 'silent' });

let sock = null;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 60_000;
const BASE_RECONNECT_DELAY_MS = 2_000;

const state = {
  status: 'disconnected', // disconnected | connecting | connected
};

export function getConnectionStatus() {
  return state.status;
}

export function getSocket() {
  return sock;
}

function backoffDelay() {
  const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  return delay;
}

/**
 * Starts (or restarts) the WhatsApp connection.
 * @param {object} handlers - { onMessages, onCredsUpdate (auto-wired), onReady, onLoggedOut }
 */
export async function connectToWhatsApp(handlers = {}) {
  if (isConnecting) {
    log.warn('Connection attempt already in progress, skipping duplicate call');
    return sock;
  }
  isConnecting = true;
  state.status = 'connecting';

  try {
    const { state: authState, saveCreds } = await loadAuthState();
    const { version, isLatest } = await fetchLatestBaileysVersion();
    log.info({ version, isLatest }, 'Using Baileys/WhatsApp Web version');

    sock = makeWASocket({
      version,
      auth: authState,
      logger: baileysLogger,
      printQRInTerminal: false, // we handle QR display ourselves for clearer logs
      browser: ['ABIX', 'Chrome', '1.0.0'],
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log.info('Scan the QR code below with WhatsApp (Linked Devices):');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        state.status = 'connected';
        reconnectAttempts = 0;
        isConnecting = false;
        log.info('WhatsApp connection established');
        if (handlers.onReady) await handlers.onReady(sock);
      }

      if (connection === 'close') {
        state.status = 'disconnected';
        isConnecting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        log.warn({ statusCode, shouldReconnect }, 'WhatsApp connection closed');

        if (statusCode === DisconnectReason.loggedOut) {
          log.error('WhatsApp session logged out. Pairing is required again.');
          if (handlers.onLoggedOut) await handlers.onLoggedOut();
          return; // do not auto-reconnect after explicit logout
        }

        if (shouldReconnect) {
          reconnectAttempts += 1;
          const delay = backoffDelay();
          log.info({ delay, attempt: reconnectAttempts }, 'Reconnecting to WhatsApp...');
          setTimeout(() => connectToWhatsApp(handlers), delay);
        }
      }
    });

    if (handlers.onMessages) {
      sock.ev.on('messages.upsert', handlers.onMessages);
    }

    return sock;
  } catch (err) {
    isConnecting = false;
    state.status = 'disconnected';
    log.error({ err: err.message }, 'Failed to initialize WhatsApp connection');
    reconnectAttempts += 1;
    const delay = backoffDelay();
    setTimeout(() => connectToWhatsApp(handlers), delay);
    return null;
  }
}

export async function gracefulShutdown() {
  log.info('Shutting down WhatsApp connection gracefully...');
  try {
    if (sock) {
      sock.ev.removeAllListeners();
      await sock.end(undefined);
    }
  } catch (err) {
    log.warn({ err: err.message }, 'Error during WhatsApp socket shutdown');
  }
  state.status = 'disconnected';
}
