const settings = require('../settings');

const recent = new Map();
const running = new Set();

function now() {
  return Date.now();
}

function prune(map, timestamp) {
  for (const [key, expiresAt] of map) {
    if (expiresAt <= timestamp) map.delete(key);
  }
}

function isHeavy(plugin = {}) {
  const category = String(plugin.category || '').toLowerCase();
  return plugin.heavy === true ||
    ['social', 'downloader', 'download', 'api'].includes(category);
}

function acquire(plugin, message, args = [], isInteraction = false) {
  const timestamp = now();
  prune(recent, timestamp);

  const chatId = String(message?.key?.remoteJid || 'unknown-chat');
  const senderId = String(message?.key?.participant || chatId);
  const userKey = `${chatId}:${senderId}`;
  const commandKey = String(plugin.command || 'unknown').toLowerCase();
  const runningKey = `${userKey}:${commandKey}`;
  const signature = `${userKey}:${commandKey}:${args.map(value => String(value).trim().toLowerCase()).join(' ')}`;
  const heavy = isHeavy(plugin);

  if (running.has(runningKey)) {
    return { allowed: false, reason: 'running', commandKey };
  }
  if (!isInteraction && recent.has(signature)) {
    return { allowed: false, reason: 'duplicate', commandKey };
  }

  const userCooldown = heavy
    ? settings.heavyCommandCooldownMs
    : settings.commandCooldownMs;
  const userCooldownKey = `${userKey}:${commandKey}`;
  if (!isInteraction && recent.has(userCooldownKey)) {
    return { allowed: false, reason: 'cooldown', commandKey };
  }

  const isGroup = chatId.endsWith('@g.us');
  const groupKey = `group:${chatId}:${commandKey}`;
  if (heavy && isGroup && !isInteraction && recent.has(groupKey)) {
    return { allowed: false, reason: 'group-cooldown', commandKey };
  }

  running.add(runningKey);
  recent.set(signature, timestamp + settings.duplicateWindowMs);
  if (!isInteraction) recent.set(userCooldownKey, timestamp + userCooldown);
  if (heavy && isGroup && !isInteraction) {
    recent.set(groupKey, timestamp + settings.heavyCommandCooldownMs);
  }

  return {
    allowed: true,
    commandKey,
    release() {
      running.delete(runningKey);
    },
  };
}

function logBlocked(result) {
  console.info(`[RATE_LIMIT] ${result.reason} command=${result.commandKey}`);
}

module.exports = { acquire, logBlocked, isHeavy };
