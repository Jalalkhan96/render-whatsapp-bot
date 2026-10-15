import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { childLogger } from './utils/logger.js';
import { getSocket, getConnectionStatus } from './whatsapp/connection.js';

const log = childLogger('renewal');
const stateFile = path.resolve('./data/abix-renewal-reminder.json');
let timer = null;

function readState() {
  try {
    if (!fs.existsSync(stateFile)) return { lastReminderAt: 0 };
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (err) {
    log.warn({ err: err.message }, 'Could not read renewal reminder state; starting fresh');
    return { lastReminderAt: 0 };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

async function maybeRemind() {
  if (getConnectionStatus() !== 'connected') return;

  const state = readState();
  const intervalMs = config.abix.renewalReminderHours * 60 * 60 * 1000;
  if (Date.now() - Number(state.lastReminderAt || 0) < intervalMs) return;

  const sock = getSocket();
  if (!sock) return;

  const jid = config.admin.jid;
  if (!jid) return;

  const text =
    `Abix renewal reminder\n\n` +
    `Abix renewal is due soon. Check the dashboard and renew the free server before the 4-day deadline.\n` +
    `The WhatsApp watchdog can recover WhatsApp connections, but the bot cannot renew/suspend Abix itself unless Abix provides an official authenticated renewal API.\n\n` +
    `Dashboard: https://control.abix.com/`;

  try {
    await sock.sendMessage(jid, { text });
    writeState({ lastReminderAt: Date.now() });
    log.info('Sent Abix renewal reminder to the admin');
  } catch (err) {
    log.warn({ err: err.message }, 'Failed to send Abix renewal reminder');
  }
}

export function startAbixRenewalReminder() {
  if (!config.abix.renewalReminderEnabled || timer) return;

  timer = setInterval(() => {
    void maybeRemind();
  }, config.abix.renewalCheckIntervalMs);
  timer.unref?.();

  log.info(
    {
      reminderHours: config.abix.renewalReminderHours,
      checkIntervalMs: config.abix.renewalCheckIntervalMs,
    },
    'Abix renewal reminder started'
  );

  void maybeRemind();
}

export function stopAbixRenewalReminder() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  log.info('Abix renewal reminder stopped');
}
