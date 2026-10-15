require('./lib/env').loadEnv();
const { getPrefix } = require('./lib/prefix');

const { readSettings: readRuntimeSettings } = require('./lib/settingsStore');
const runtimeSettings = readRuntimeSettings();

let packageVersion = '0.0.0';
try { packageVersion = require('./package.json').version || packageVersion; } catch {}

const settings = {
  // Array fallback: splits string by comma, or uses default array
  prefixes: [getPrefix() || '-'],
  
  packname: process.env.PACKNAME || 'myBOT',
  author: process.env.AUTHOR || 'myBOT',
  timeZone: process.env.TIMEZONE || 'Asia/Karachi',
  botName: process.env.BOT_NAME || 'myBOT',
  newsletterJid: process.env.NEWSLETTER_JID || process.env.CHANNEL_JID || '',
  newsletterName: process.env.NEWSLETTER_NAME || process.env.CHANNEL_NAME || 'myBOT',
  botOwner: process.env.BOT_OWNER || 'Bot Owner',
  botNumber: process.env.BOT_NUMBER || '',
  ownerNumber: process.env.OWNER_NUMBER || '',
  secondaryOwnerNumbers: String(process.env.SECONDARY_OWNER_NUMBERS || process.env.SECONDARY_OWNER || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
  giphyApiKey: process.env.GIPHY_API_KEY || '',
  commandMode: process.env.COMMAND_MODE || 'public',
  commandCooldownMs: Number(process.env.COMMAND_COOLDOWN_MS) || 800,
  heavyCommandCooldownMs: Number(process.env.HEAVY_COMMAND_COOLDOWN_MS) || 2000,
  duplicateWindowMs: Number(process.env.DUPLICATE_WINDOW_MS) || 1500,
  responseDelay: Number.isFinite(Number(runtimeSettings.responseDelay)) ? Number(runtimeSettings.responseDelay) : 0.3,
  commandCooldowns: runtimeSettings.commandCooldowns && typeof runtimeSettings.commandCooldowns === 'object' ? runtimeSettings.commandCooldowns : {},
  
  maxStoreMessages: Number(process.env.MAX_STORE_MESSAGES) || 20,
  tempCleanupInterval: Number(process.env.CLEANUP_INTERVAL) || 1 * 60 * 60 * 1000,
  storeWriteInterval: Math.max(60 * 1000, Number(process.env.STORE_WRITE_INTERVAL) || 5 * 60 * 1000),
  
  description: process.env.DESCRIPTION || 'myBOT WhatsApp bot for managing group commands and automating tasks.',
  version: packageVersion,
  updateZipUrl: process.env.UPDATE_URL || 'https://github.com/GlobalTechInfo/ABIX-AE/archive/refs/heads/main.zip',
  channelLink: process.env.CHANNEL_LINK || 'https://whatsapp.com/channel/0029VbCtbpiGufInxUWdvu27',
  ytch: process.env.YT_CHANNEL || 'ABIX'
};

module.exports = settings;
