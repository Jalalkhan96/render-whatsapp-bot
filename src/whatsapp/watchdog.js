import { childLogger } from '../utils/logger.js';
import { connectToWhatsApp, getConnectionStatus } from './connection.js';
import { config } from '../config.js';

const log = childLogger('watchdog');

let timer = null;
let handlers = {};
let disconnectedSince = null;
let lastRecoveryAttempt = 0;

const CHECK_INTERVAL_MS = config.whatsapp.watchdogIntervalMs;
const DISCONNECTED_THRESHOLD_MS = config.whatsapp.reconnectAfterMs;
const RECOVERY_COOLDOWN_MS = config.whatsapp.recoveryCooldownMs;

function checkConnection() {
  const status = getConnectionStatus();

  if (status === 'connected') {
    if (disconnectedSince !== null) {
      log.info('WhatsApp watchdog: connection recovered');
    }
    disconnectedSince = null;
    return;
  }

  if (disconnectedSince === null) {
    disconnectedSince = Date.now();
    log.warn({ status }, 'WhatsApp watchdog: connection is not healthy');
    return;
  }

  const disconnectedFor = Date.now() - disconnectedSince;
  if (disconnectedFor < DISCONNECTED_THRESHOLD_MS) return;

  if (Date.now() - lastRecoveryAttempt < RECOVERY_COOLDOWN_MS) return;

  lastRecoveryAttempt = Date.now();
  disconnectedSince = Date.now();
  log.warn({ status, disconnectedFor }, 'WhatsApp watchdog: attempting connection recovery');

  // Do not delete auth state here. A transport failure should reuse the
  // persisted Baileys session. Explicit logout still requires QR pairing.
  void connectToWhatsApp(handlers).catch((err) => {
    log.error({ err: err.message }, 'WhatsApp watchdog: recovery attempt failed');
  });
}

export function startWhatsAppWatchdog(nextHandlers = {}) {
  handlers = nextHandlers;
  if (timer) return;

  timer = setInterval(checkConnection, CHECK_INTERVAL_MS);
  timer.unref?.();
  log.info(
    { checkIntervalMs: CHECK_INTERVAL_MS, reconnectAfterMs: DISCONNECTED_THRESHOLD_MS },
    'WhatsApp watchdog started'
  );
}

export function stopWhatsAppWatchdog() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  disconnectedSince = null;
  log.info('WhatsApp watchdog stopped');
}
