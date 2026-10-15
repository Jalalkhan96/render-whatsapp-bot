import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envCandidates = [
  process.env.DOTENV_CONFIG_PATH,
  process.env.BOT_ENV_PATH,
  process.env.ENV_FILE,
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
];

const envPath = envCandidates.find((candidate) => candidate && fs.existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

function normalizeAdminNumbers() {
  const rawValues = [
    process.env.ADMIN_NUMBER,
    process.env.ADMIN_NUMBERS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[\s,]+/));

  const values = new Set();
  for (const value of rawValues) {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned) values.add(cleaned);
  }

  return [...values];
}

const adminNumbers = normalizeAdminNumbers();
const required = ['GEMINI_API_KEY', 'DATABASE_URL'];

function normalizeJid(numberOrJid) {
  if (!numberOrJid) return null;
  if (numberOrJid.includes('@')) return numberOrJid;
  return `${numberOrJid.replace(/\D/g, '')}@s.whatsapp.net`;
}

function intEnv(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name, fallback) {
  if (process.env[name] == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name]).toLowerCase());
}

function validateEnv() {
  const missing = required.filter((key) => !process.env[key] || process.env[key].trim() === '');
  if (!adminNumbers.length) {
    missing.push('ADMIN_NUMBER or ADMIN_NUMBERS');
  }

  if (missing.length) {
    console.error(
      `\n[FATAL] Missing required environment variables: ${missing.join(', ')}\n` +
      `Loaded .env from: ${envPath || 'default lookup'}\n`
    );
    process.exit(1);
  }
}

validateEnv();

export const config = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },

  database: { url: process.env.DATABASE_URL },

  admin: {
    number: adminNumbers[0] || process.env.ADMIN_NUMBER,
    numbers: adminNumbers,
    jid: normalizeJid(adminNumbers[0] || process.env.ADMIN_NUMBER),
    jids: adminNumbers.map(normalizeJid),
  },

  bot: {
    name: process.env.BOT_NAME || 'ABIX',
    prefix: process.env.BOT_PREFIX || '$',
    version: '2.0.0',
  },

  memory: {
    maxHistory: intEnv('MAX_HISTORY', 30),
  },

  limits: {
    maxMessageLength: intEnv('MAX_MESSAGE_LENGTH', 10000),
    maxConcurrentRequests: intEnv('MAX_CONCURRENT_REQUESTS', 3),
    maxDailyRequests: intEnv('MAX_DAILY_REQUESTS', 100),
    requestCooldownMs: intEnv('REQUEST_COOLDOWN_MS', 2000),
  },

  groups: {
    mode: process.env.GROUP_MODE || 'command_only',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  http: {
    port: intEnv('PORT', 3000),
  },

  auth: {
    dir: process.env.AUTH_DIR || './data/auth',
  },

  whatsapp: {
    watchdogIntervalMs: intEnv('WATCHDOG_INTERVAL_MS', 30000),
    reconnectAfterMs: intEnv('WATCHDOG_RECONNECT_AFTER_MS', 120000),
    recoveryCooldownMs: intEnv('WATCHDOG_RECOVERY_COOLDOWN_MS', 180000),
  },

  abix: {
    renewalReminderEnabled: boolEnv('ABIX_RENEWAL_REMINDER_ENABLED', true),
    renewalReminderHours: intEnv('ABIX_RENEWAL_REMINDER_HOURS', 60),
    renewalCheckIntervalMs: intEnv('ABIX_RENEWAL_CHECK_INTERVAL_MS', 1800000),
  },

  downloads: {
    maxBytes: intEnv('MAX_DOWNLOAD_BYTES', 100 * 1024 * 1024),
    apiUrl: process.env.MEDIA_DOWNLOADER_API_URL || 'https://api.omegatech.app/api/download/All-downloader-v2',
    youtubeApiUrl: process.env.YOUTUBE_API_URL || '',
    youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  },
};

export { normalizeJid };
