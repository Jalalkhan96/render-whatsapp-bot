const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
//                    EASY CONFIGURATION
// ============================================================
// Edit this section when moving the plugin to another compatible bot.
const DEFAULT_CONFIG = {
  ENABLED: true, // Master switch for this Islamic feature.
  GROUP_ONLY: true, // Restrict setup and automatic reminders to WhatsApp groups.
  TIMEZONE: 'Asia/Karachi', // Default IANA timezone for dates and schedules.
  LOCATION: 'Abbottabad, Pakistan', // Default AlAdhan location query.
  DAROOD_ENABLED: true, // Enable the daily Darood scheduler by default.
  DAROOD_TIME: '21:52', // Daily Darood time in 24-hour HH:MM format.
  NAMAZ_ENABLED: false, // Prayer reminders are opt-in for each group.
  CALCULATION_METHOD: 1, // AlAdhan calculation method; 1 is University of Islamic Sciences, Karachi.
  SCHOOL: 1, // Asr school: 0 Shafi, 1 Hanafi in the AlAdhan API.
  DAILY_THEME: true, // Rotate deterministically through the seven themes below.
  COMMANDS: { // Default command names; administrators may rename them per group.
    menu: 'islmenu',
    setup: 'islsetup',
    status: 'islstatus',
    darood: 'darood',
    namaz: 'namaz',
    dua: 'dua',
    ayat: 'ayatulkursi',
    kalma: 'kalma',
    tasbih: 'tasbih',
    jumma: 'jumma',
    hijri: 'hijri',
    islamicstatus: 'islstatus',
  },
};

const DATA_DIR = path.join(process.cwd(), 'data', 'islamic');
const STATE_FILE = path.join(DATA_DIR, 'config.json');
const PRAYER_CACHE_TTL = 6 * 60 * 60 * 1000;
const CHECK_INTERVAL = 20 * 1000;
const COMMAND_PATTERN = /^[a-z0-9_-]{1,32}$/;
const DAILY_THEMES = [
  { name: 'Peace & Blessings', icon: '🌿' },
  { name: 'Light of Faith', icon: '✨' },
  { name: 'Heart of Dhikr', icon: '🤍' },
  { name: 'Friday Blessings', icon: '🌙' },
  { name: 'Patience & Gratitude', icon: '🌸' },
  { name: 'Mercy & Forgiveness', icon: '🤲' },
  { name: 'Hope & Tawakkul', icon: '🕊️' },
];

const DAROOD_ARABIC = 'اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ';
const CONTENT = {
  dua: ['🌿 Dua for Knowledge', 'رَبِّ زِدْنِي عِلْمًا', 'My Lord, increase me in knowledge.'],
  ayat: ['📖 Ayat-ul-Kursi', 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ', 'Allah, there is no deity except Him, the Ever-Living, the Sustainer of all.'],
  kalma: ['📖 Kalma Tayyabah', 'لَا إِلٰهَ إِلَّا اللّٰهُ مُحَمَّدٌ رَسُولُ اللّٰهِ', 'There is no deity except Allah; Muhammad is the Messenger of Allah.'],
  tasbih: ['📿 Daily Tasbih', 'سُبْحَانَ اللّٰهِ\nالْحَمْدُ لِلّٰهِ\nاللّٰهُ أَكْبَرُ', 'Remember Allah throughout your day.'],
};

let state = loadState();
const initializedSockets = new WeakSet();
const schedulerSockets = new WeakSet();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function groupDefaults() {
  return {
    enabled: DEFAULT_CONFIG.ENABLED,
    groupOnly: DEFAULT_CONFIG.GROUP_ONLY,
    timezone: DEFAULT_CONFIG.TIMEZONE,
    location: DEFAULT_CONFIG.LOCATION,
    daroodEnabled: DEFAULT_CONFIG.DAROOD_ENABLED,
    daroodTime: DEFAULT_CONFIG.DAROOD_TIME,
    namazEnabled: DEFAULT_CONFIG.NAMAZ_ENABLED,
    calculationMethod: DEFAULT_CONFIG.CALCULATION_METHOD,
    school: DEFAULT_CONFIG.SCHOOL,
    dailyTheme: DEFAULT_CONFIG.DAILY_THEME,
    commands: clone(DEFAULT_CONFIG.COMMANDS),
    prayerCache: null,
    daroodLastSent: null,
    namazSent: {},
  };
}

function loadState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STATE_FILE)) {
      const initial = { version: 1, groups: {} };
      atomicWrite(initial);
      return initial;
    }
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.groups || typeof parsed.groups !== 'object') throw new Error('Invalid state shape');
    return { version: 1, groups: parsed.groups };
  } catch (error) {
    try {
      if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, `${STATE_FILE}.corrupt-${Date.now()}.bak`);
    } catch {}
    const fallback = { version: 1, groups: {} };
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); atomicWrite(fallback); } catch (writeError) { console.error('[ISLAMIC] State reset failed:', writeError.message); }
    console.error('[ISLAMIC] State reset:', error.message);
    return fallback;
  }
}

function atomicWrite(value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${STATE_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, STATE_FILE);
}

function saveState() {
  try { atomicWrite(state); } catch (error) { console.error('[ISLAMIC] State save failed:', error.message); }
}

function getGroup(jid) {
  if (!state.groups[jid]) {
    state.groups[jid] = groupDefaults();
    saveState();
  }
  return state.groups[jid];
}

function validTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function validTimezone(value) {
  try { Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(value); } catch { return false; }
}

function prefixFor(context) {
  return context.prefix || (context.rawText && context.rawText[0]) || '-';
}

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function localDate(date, timezone) {
  const parts = localParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentTheme(config, date = new Date()) {
  if (!config.dailyTheme) return DAILY_THEMES[0];
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
  return DAILY_THEMES[((day % DAILY_THEMES.length) + DAILY_THEMES.length) % DAILY_THEMES.length];
}

function formatTime(value) {
  if (!value || value === 'Unavailable') return 'Unavailable';
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function box(title, lines) {
  return [`╭━━━〔 ${title} 〕━━━╮`, '┃', ...lines.map(line => `┃ ${line}`), '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯'].join('\n');
}

function isGroupMessage(message, context) {
  return Boolean(context.isGroup || message?.key?.remoteJid?.endsWith('@g.us'));
}

async function isAdmin(sock, message, context) {
  if (context.isSenderAdmin || context.isOwner) return true;
  const jid = context.chatId || message?.key?.remoteJid;
  const sender = context.senderId || message?.key?.participant;
  if (!jid?.endsWith('@g.us') || !sender || typeof sock.groupMetadata !== 'function') return false;
  try {
    const metadata = await sock.groupMetadata(jid);
    const member = metadata.participants.find(item => item.id === sender || item.jid === sender);
    return member?.admin === 'admin' || member?.admin === 'superadmin';
  } catch { return false; }
}

async function send(sock, jid, text, message) {
  return sock.sendMessage(jid, { text }, message ? { quoted: message } : undefined);
}

function commandNames(config) {
  return new Set(Object.values(config.commands).map(name => String(name).toLowerCase()));
}

function featureForCommand(config, commandName) {
  return Object.entries(config.commands).find(([, name]) => String(name).toLowerCase() === commandName)?.[0] || null;
}

function commandFromMessage(message, context) {
  const text = String(context.messageText || context.rawText || '').trim();
  const prefix = prefixFor(context);
  const withoutPrefix = text.startsWith(prefix) ? text.slice(prefix.length).trim() : text;
  return withoutPrefix.split(/\s+/)[0].toLowerCase();
}

function commandHelp(config, prefix) {
  return [
    `📿 ${prefix}${config.commands.darood}`,
    `🕌 ${prefix}${config.commands.namaz}`,
    `🤲 ${prefix}${config.commands.dua}`,
    `📖 ${prefix}${config.commands.ayat}`,
    `📖 ${prefix}${config.commands.kalma}`,
    `📿 ${prefix}${config.commands.tasbih}`,
    `🌙 ${prefix}${config.commands.jumma}`,
    `📅 ${prefix}${config.commands.hijri}`,
    `📖 ${prefix}quranmenu`,
    '',
    `⚙️ ${prefix}${config.commands.setup}`,
    `📊 ${prefix}${config.commands.status}`,
  ];
}

function renderDarood(config, date = new Date(), automatic = false) {
  const theme = currentTheme(config, date);
  return `${box(automatic ? '📿 DAILY DAROOD' : '📿 DAROOD SHAREEF', [
    '       🌙 TODAY\'S DHIKR',
    '',
    'اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ',
    'وَعَلَىٰ آلِ مُحَمَّدٍ',
    '',
    '🤍 Allahumma Salli Ala Muhammad ﷺ',
    '',
    '┣━━━━━━━━━━━━━━━━━━━━━━',
    `📅 Daily Reminder`,
    `🕰️ ${formatTime(config.daroodTime)}`,
    `${theme.icon} Theme: ${theme.name}`,
  ])}\n\n🤲 May Allah send peace and blessings\n   upon Muhammad ﷺ and his family.\n\n📿 Don\'t forget to send Durood today.`;
}

function renderSetup(config, prefix) {
  return `${box('⚙️ ISLAMIC SETUP', [
    '🕌 1-MINUTE CONFIGURATION',
    '',
    '1️⃣ Set Darood Time',
    '2️⃣ Enable Namaz',
    '3️⃣ Disable Namaz',
    '4️⃣ Set Location',
    '5️⃣ Set Timezone',
    '6️⃣ Set Custom Commands',
    '7️⃣ View Current Settings',
  ])}\n\n💡 QUICK COMMANDS\n\n📿 ${prefix}${config.commands.darood} time 21:52\n🕌 ${prefix}${config.commands.namaz} on\n📍 ${prefix}isl location Abbottabad, Pakistan\n🌍 ${prefix}isl timezone Asia/Karachi\n📊 ${prefix}${config.commands.status}`;
}

function renderMenu(config, prefix, prayer) {
  const theme = currentTheme(config);
  const times = prayer?.timings || {};
  return `${box('🕌 ISLAMIC DAILY', [
    '🌙 Assalamu Alaikum',
    '',
    '📿 Daily Darood Shareef',
    '🕋 Namaz Reminders',
    '🤲 Duas & Azkar',
    `📖 Quran & Islamic Info  → ${prefix}quranmenu`,
    '',
    '┌─〔 📿 DAROOD 〕',
    `│ ⏰ Time     : ${formatTime(config.daroodTime)}`,
    `│ ${theme.icon} Theme    : ${theme.name}`,
    `│ 🔄 Daily    : ${config.daroodEnabled ? 'Enabled' : 'Disabled'}`,
    '└──────────────────────────',
    '',
    '┌─〔 🕌 NAMAZ 〕',
    `│ 🌅 Fajr     : ${formatTime(times.Fajr)}`,
    `│ ☀️ Dhuhr    : ${formatTime(times.Dhuhr)}`,
    `│ 🌇 Asr      : ${formatTime(times.Asr)}`,
    `│ 🌆 Maghrib  : ${formatTime(times.Maghrib)}`,
    `│ 🌙 Isha     : ${formatTime(times.Isha)}`,
    '└──────────────────────────',
    '',
    '┌─〔 ⚙️ QUICK SETUP 〕',
    `│ ${prefix}${config.commands.setup}`,
    `│ ${prefix}${config.commands.darood} time 21:52`,
    `│ ${prefix}${config.commands.namaz} on`,
    `│ ${prefix}${config.commands.namaz} off`,
    `│ ${prefix}${config.commands.status}`,
    '└──────────────────────────',
  ])}\n\n╰─「 May Allah bless you 🤍 」`;
}

function renderStatus(config, prefix, prayer) {
  const theme = currentTheme(config);
  const times = prayer?.timings || {};
  return box('📊 ISLAMIC STATUS', [
    '🕌 Islamic System',
    '',
    `🔘 Plugin       : ${config.enabled ? 'Enabled' : 'Disabled'}`,
    `📿 Darood      : ${config.daroodEnabled ? 'Enabled' : 'Disabled'}`,
    `🕰️ Darood Time : ${formatTime(config.daroodTime)}`,
    `🕌 Namaz       : ${config.namazEnabled ? 'Enabled' : 'Disabled'}`,
    '',
    '📍 Location',
    config.location,
    '',
    '🌍 Timezone',
    config.timezone,
    '',
    `${theme.icon} Theme`,
    theme.name,
    '',
    '┣━━━━━━━━━━━━━━━━━━━━━━',
    '🕌 TODAY\'S NAMAZ',
    `🌅 Fajr     ${formatTime(times.Fajr)}`,
    `☀️ Dhuhr    ${formatTime(times.Dhuhr)}`,
    `🌇 Asr      ${formatTime(times.Asr)}`,
    `🌆 Maghrib  ${formatTime(times.Maghrib)}`,
    `🌙 Isha     ${formatTime(times.Isha)}`,
    '',
    `Use ${prefix}${config.commands.menu} for the Islamic menu.`,
  ]);
}

function renderNamaz(config, prayer) {
  const times = prayer?.timings || {};
  return `${box('🕌 TODAY\'S NAMAZ', [
    `📍 ${config.location}`,
    `📅 ${prayer?.date || 'Today'}`,
    '',
    `🌅 Fajr      ${formatTime(times.Fajr)}`,
    `☀️ Dhuhr     ${formatTime(times.Dhuhr)}`,
    `🌇 Asr       ${formatTime(times.Asr)}`,
    `🌆 Maghrib   ${formatTime(times.Maghrib)}`,
    `🌙 Isha      ${formatTime(times.Isha)}`,
  ])}\n\n🤲 May Allah accept your Salah.`;
}

async function fetchPrayer(config) {
  const day = localDate(new Date(), config.timezone);
  if (config.prayerCache && config.prayerCache.date === day && Date.now() - config.prayerCache.fetchedAt < PRAYER_CACHE_TTL) return config.prayerCache;
  const url = `https://api.aladhan.com/v1/timingsByAddress/${encodeURIComponent(day)}?address=${encodeURIComponent(config.location)}&method=${config.calculationMethod}&school=${config.school}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const data = payload?.data;
    if (!data?.timings) throw new Error('Prayer timings missing');
    const prayer = {
      date: data.date?.readable || day,
      dateIso: day,
      timings: Object.fromEntries(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map(name => [name, String(data.timings[name] || '').slice(0, 5)])),
      fetchedAt: Date.now(),
    };
    config.prayerCache = prayer;
    saveState();
    return prayer;
  } catch (error) {
    console.error('[ISLAMIC] Prayer API error:', error.message);
    return config.prayerCache && config.prayerCache.dateIso === day ? config.prayerCache : null;
  }
}

async function fetchHijri(config) {
  const date = localDate(new Date(), config.timezone).split('-').reverse().join('-');
  try {
    const response = await fetch(`https://api.aladhan.com/v1/gToH?date=${date}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data?.data?.hijri;
  } catch (error) {
    console.error('[ISLAMIC] Hijri API error:', error.message);
    return null;
  }
}

function clearPrayerCache(config) {
  config.prayerCache = null;
}

function adminError() {
  return box('🔐 ADMIN ONLY', ['❌ This setting can only', '   be changed by a group admin.']);
}

async function resetGroup(config, jid) {
  state.groups[jid] = groupDefaults();
  saveState();
  return state.groups[jid];
}

function customCommandTarget(config, value) {
  return Object.entries(config.commands).find(([, command]) => command === value)?.[0] || null;
}

function hasCommandConflict(commandHandler, value, config) {
  const target = customCommandTarget(config, value);
  if (target) return false;
  return commandHandler?.commands?.has(value) || commandHandler?.aliases?.has(value);
}

function attachStandaloneListener(sock) {
  if (!sock?.ev || initializedSockets.has(sock)) return;
  const listener = async update => {
    for (const message of update?.messages || []) {
      if (!message?.message || message.key?.fromMe) continue;
      const jid = message.key?.remoteJid;
      const isGroup = jid?.endsWith('@g.us');
      if (!jid || (DEFAULT_CONFIG.GROUP_ONLY && !isGroup)) continue;
      const text = message.message.conversation || message.message.extendedTextMessage?.text || '';
      const prefix = text.trim()[0];
      if (!prefix || !text.startsWith(prefix)) continue;
      const config = state.groups[jid];
      if (!config) continue;
      const parts = text.trim().slice(prefix.length).trim().split(/\s+/);
      const name = parts.shift()?.toLowerCase();
      const customNames = commandNames(config);
      if (!customNames.has(name) || Object.values(DEFAULT_CONFIG.COMMANDS).includes(name)) continue;
      try { await dispatch(sock, message, parts, { chatId: jid, senderId: message.key.participant || jid, isGroup, prefix }, config, name); } catch (error) { console.error('[ISLAMIC] Listener error:', error.message); }
    }
  };
  sock.ev.on('messages.upsert', listener);
  sock.__islamicListenerAttached = true;
  initializedSockets.add(sock);
}

function startScheduler(sock) {
  if (schedulerSockets.has(sock)) return;
  schedulerSockets.add(sock);
  const tick = async () => {
    const now = new Date();
    for (const [jid, config] of Object.entries(state.groups)) {
      if (!config.enabled || (config.groupOnly && !jid.endsWith('@g.us'))) continue;
      const parts = localParts(now, config.timezone);
      const today = `${parts.year}-${parts.month}-${parts.day}`;
      const minute = `${parts.hour}:${parts.minute}`;
      try {
        if (config.daroodEnabled && config.daroodTime === minute && config.daroodLastSent !== today) {
          await send(sock, jid, renderDarood(config, now, true));
          config.daroodLastSent = today;
          saveState();
        }
        if (!config.namazEnabled) continue;
        const prayer = await fetchPrayer(config);
        for (const name of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
          if (prayer?.timings?.[name] !== minute || config.namazSent?.[name] === today) continue;
          await send(sock, jid, `${box('🕌 NAMAZ REMINDER', [`🔔 It\'s time for ${name}`, `🕰️ Time: ${formatTime(minute)}`, '', '┣━━━━━━━━━━━━━━━━━━━━━━', '📖 Prayer is prescribed for believers at appointed times.'])}\n\n🤲 May Allah accept your Salah.`);
          config.namazSent[name] = today;
          saveState();
        }
      } catch (error) { console.error('[ISLAMIC] Scheduler error:', error.message); }
    }
  };
  const timer = setInterval(tick, CHECK_INTERVAL);
  timer.unref?.();
  sock.__islamicScheduler = timer;
}

async function dispatch(sock, message, args, context, config, commandName) {
  const prefix = prefixFor(context);
  const c = config.commands;
  const feature = featureForCommand(config, commandName);
  if (feature) {
    if (feature === 'menu') return send(sock, context.chatId, renderMenu(config, prefix, await fetchPrayer(config)), message);
    if (feature === 'setup') return send(sock, context.chatId, renderSetup(config, prefix), message);
    if (feature === 'status' || feature === 'islamicstatus') return send(sock, context.chatId, renderStatus(config, prefix, await fetchPrayer(config)), message);
    if (feature === 'darood') {
      const action = String(args[0] || '').toLowerCase();
      if (action === 'on' || action === 'off') { if (!(await isAdmin(sock, message, context))) return send(sock, context.chatId, adminError(), message); config.daroodEnabled = action === 'on'; saveState(); return send(sock, context.chatId, box('📿 DAROOD', [`${config.daroodEnabled ? '✅' : '⛔'} Daily Darood ${config.daroodEnabled ? 'ENABLED' : 'DISABLED'}`, `🕰️ Time: ${formatTime(config.daroodTime)}`]), message); }
      if (action === 'time') { if (!(await isAdmin(sock, message, context))) return send(sock, context.chatId, adminError(), message); if (!validTime(args[1])) return send(sock, context.chatId, '❌ Invalid time. Use HH:MM, for example 21:52.', message); config.daroodTime = args[1]; saveState(); return send(sock, context.chatId, box('📿 DAROOD SCHEDULE', ['✅ Daily Darood scheduled', `🕰️ Time: ${formatTime(config.daroodTime)}`, '🌿 Theme: Automatic', '🔄 Repeat: Every day']), message); }
      return send(sock, context.chatId, renderDarood(config), message);
    }
    if (feature === 'namaz') { const action = String(args[0] || '').toLowerCase(); if (action === 'on' || action === 'off') { if (!(await isAdmin(sock, message, context))) return send(sock, context.chatId, adminError(), message); config.namazEnabled = action === 'on'; if (!config.namazEnabled) config.namazSent = {}; clearPrayerCache(config); saveState(); return send(sock, context.chatId, box('🕌 NAMAZ', [`${config.namazEnabled ? '✅' : '⛔'} Namaz reminders ${config.namazEnabled ? 'ENABLED' : 'DISABLED'}`]), message); } const prayer = await fetchPrayer(config); return send(sock, context.chatId, prayer ? renderNamaz(config, prayer) : '⚠️ Prayer times temporarily unavailable.\nPlease check your configured location/API connection.', message); }
    if (['dua', 'ayat', 'kalma', 'tasbih'].includes(feature)) { const item = CONTENT[feature]; return send(sock, context.chatId, box(item[0], [item[1], '', `🤲 ${item[2]}`]), message); }
    if (feature === 'jumma') return send(sock, context.chatId, box('🌙 JUMMAH REMINDER', ['🤍 Jumu\'ah Mubarak', '📿 Increase your Dhikr', '📖 Read Surah Al-Kahf', '🤲 Make Dua', '🕌 Send Durood upon the Prophet ﷺ']), message);
    if (feature === 'hijri') { const hijri = await fetchHijri(config); return send(sock, context.chatId, hijri ? box('🌙 HIJRI DATE', [`📅 Gregorian: ${localDate(new Date(), config.timezone)}`, `🌙 Hijri: ${hijri.day} ${hijri.month.en} ${hijri.year}`, `🌍 Timezone: ${config.timezone}`]) : '⚠️ Hijri date temporarily unavailable.', message); }
  }

  const action = String(args[0] || '').toLowerCase();
  if (commandName === 'isl' || commandName === 'islamic') {
    if (!(await isAdmin(sock, message, context))) return send(sock, context.chatId, adminError(), message);
    if (action === 'location') { const location = args.slice(1).join(' ').trim(); if (!location) return send(sock, context.chatId, '❌ Provide a location, for example Abbottabad, Pakistan.', message); config.location = location; clearPrayerCache(config); saveState(); return send(sock, context.chatId, box('📍 LOCATION UPDATED', ['✅ Location saved', `📍 ${location}`, '🔄 Prayer times will be recalculated automatically.']), message); }
    if (action === 'timezone') { const timezone = args[1]; if (!validTimezone(timezone)) return send(sock, context.chatId, '❌ Invalid IANA timezone.', message); config.timezone = timezone; clearPrayerCache(config); saveState(); return send(sock, context.chatId, box('🌍 TIMEZONE UPDATED', ['✅ Timezone saved', `🌍 ${timezone}`]), message); }
    if (action === 'method' || action === 'school') { const value = Number(args[1]); if (!Number.isInteger(value) || value < 0 || value > 23) return send(sock, context.chatId, '❌ Use a supported numeric calculation method or school value.', message); if (action === 'method') config.calculationMethod = value; else config.school = value; clearPrayerCache(config); saveState(); return send(sock, context.chatId, box('⚙️ SETTINGS UPDATED', [`✅ ${action} set to ${value}`]), message); }
    if (action === 'command') { const target = args[1]; const value = String(args[2] || '').toLowerCase(); if (!c[target] || !COMMAND_PATTERN.test(value) || value.includes(prefix)) return send(sock, context.chatId, '❌ Invalid custom command name.', message); if (hasCommandConflict(context.commandHandler, value, config)) return send(sock, context.chatId, '⚠️ That command is already used by the bot.', message); config.commands[target] = value; saveState(); return send(sock, context.chatId, box('⚙️ COMMAND UPDATED', [`✅ ${target} is now ${prefix}${value}`]), message); }
    if (action === 'reset' && args[1] === 'confirm') { await resetGroup(config, context.chatId); return send(sock, context.chatId, '✅ Islamic settings reset for this group.', message); }
    return send(sock, context.chatId, `Use ${prefix}${c.menu} to view Islamic commands.`, message);
  }
}

module.exports = {
  command: 'islmenu',
  aliases: ['islamic', 'isl', 'islsetup', 'islstatus', 'darood', 'namaz', 'dua', 'ayatulkursi', 'kalma', 'tasbih', 'jumma', 'hijri'],
  category: 'education',
  description: 'Islamic daily reminders, Namaz, Darood and duas',
  usage: '-islmenu',
  async handler(sock, message, args, context = {}) {
    const jid = context.chatId || message?.key?.remoteJid;
    const group = isGroupMessage(message, context);
    if (DEFAULT_CONFIG.GROUP_ONLY && !group) return send(sock, jid, '❌ This Islamic feature is available in groups only.', message);
    const config = getGroup(jid);
    if (!config.enabled) return send(sock, jid, '⛔ Islamic features are disabled for this group.', message);
    const commandName = commandFromMessage(message, context) || DEFAULT_CONFIG.COMMANDS.menu;
    attachStandaloneListener(sock);
    startScheduler(sock);
    return dispatch(sock, message, args, { ...context, chatId: jid, prefix: prefixFor(context) }, config, commandName);
  },
};
