import { config } from './config.js';
import { childLogger } from './utils/logger.js';
import { checkDatabaseConnection, closeDatabase } from './database/database.js';
import { connectToWhatsApp, gracefulShutdown } from './whatsapp/connection.js';
import { createMessageHandler } from './whatsapp/handler.js';
import { startHealthServer } from './httpServer.js';
import { resetAuthState } from './whatsapp/auth.js';
import { startWhatsAppWatchdog, stopWhatsAppWatchdog } from './whatsapp/watchdog.js';
import { startAbixRenewalReminder, stopAbixRenewalReminder } from './kataBumpReminder.js';

const log = childLogger('startup');

async function main() {
  console.log('====================================');
  console.log(`${config.bot.name}`);
  console.log('====================================');

  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    log.error('Database: FAILED to connect. Did you run `npm run migrate`? Exiting.');
    process.exit(1);
  }
  log.info('Database: Connected');
  log.info('Gemini: Configured');
  log.info('WhatsApp: Connecting...');

  const httpServer = startHealthServer();

  let sockRef = null;

  const connectionHandlers = {
    onReady: async (sock) => {
      sockRef = sock;
      sock.ev.on('messages.upsert', createMessageHandler(sock));
      log.info('WhatsApp: Connected. Bot is ready.');
    },
    onLoggedOut: async () => {
      log.error(
        'Session was logged out from the phone. Automatic recovery will not delete auth state; ' +
          'a new QR pairing is required only after an explicit logout or auth reset.'
      );
    },
  };

  await connectToWhatsApp(connectionHandlers);
  startWhatsAppWatchdog(connectionHandlers);
  startAbixRenewalReminder();

  /*
  await connectToWhatsApp({
    onReady: async (sock) => {
      sockRef = sock;
      sock.ev.on('messages.upsert', createMessageHandler(sock));
      log.info('WhatsApp: Connected. Bot is ready.');
    },
    onLoggedOut: async () => {
      log.error(
        'Session was logged out from the phone. To re-pair, stop the process, optionally back up ' +
          'the ./data/auth directory elsewhere, then clear it and restart the bot to get a new QR code.'
      );
    },
  });

  */

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    log.info({ signal }, 'Shutdown signal received, closing gracefully...');
    try {
      stopWhatsAppWatchdog();
      stopAbixRenewalReminder();
      await gracefulShutdown();
      await closeDatabase();
      httpServer.close();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    log.error({ reason: reason?.message || reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    log.error({ err: err.message, stack: err.stack }, 'Uncaught exception - process will continue running');
    // Intentionally do not exit: a single bad code path should not take down the bot.
    // PM2 remains the safety net for truly fatal crashes.
  });
}

main().catch((err) => {
  log.error({ err: err.message, stack: err.stack }, 'Fatal error during startup');
  process.exit(1);
});

// Exported for potential programmatic reset/testing use.
export { resetAuthState };
