'use strict';

/**
 * Telegram transport for ABIX-AE.
 *
 * Intentionally uses the official Telegram Bot API over Node's built-in fetch
 * instead of adding a Telegram SDK dependency. WhatsApp/Baileys remains an
 * independent transport in the same process; WhatsApp-only plugin handlers are
 * not invoked with fake Telegram messages.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { isBlockedAdultRequest } = require('./contentRestrictions');
const soundcloudService = require('../soundcloud.cjs');
const {
  generateTextProImage, getLatestTemplates, searchTextPro,
  POPULAR_TEMPLATES, NEW_TEMPLATES, SITE_CONFIGS,
} = require('./textproService.cjs');
const {
  ALL_TEMPLATES, EPHOTO_POPULAR_TEMPLATES, EPHOTO_NEW_TEMPLATES,
  BIRTHDAY_POPULAR_TEMPLATES, BIRTHDAY_NEW_TEMPLATES,
  resolveTemplate, resolveSiteKey, siteKeyForUrl, getSiteConfig, getSiteTemplates,
  splitTextFields, templateUsage, safeText: textProSafeText,
} = require('./textproCatalog.cjs');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PREFERENCES_FILE = path.join(DATA_DIR, 'telegram-preferences.json');
const UPDATE_OFFSET_FILE = path.join(DATA_DIR, 'telegram-poll-offset.json');
const CHAT_SETTINGS_FILE = path.join(DATA_DIR, 'telegram-chat-settings.json');
const MAX_MESSAGE_LENGTH = 4096;
const MAX_CAPTION_LENGTH = 1024;
const MAX_CALLBACK_BYTES = 64;
const DEFAULT_POLL_TIMEOUT_SECONDS = 25;
const THEMES = Object.freeze({
  cyber: { name: 'Neon Cyber', icon: '⚡', divider: '━━━━━━━━━━━━━━━━' },
  matrix: { name: 'Matrix', icon: '🟢', divider: '════════════════' },
  minimal: { name: 'Minimal', icon: '◇', divider: '────────────────' },
});

const FEATURES = Object.freeze([
  { id: 'ai', title: 'AI Assistant', category: 'tools', description: 'Ask the configured Gemini service questions.' },
  { id: 'image', title: 'Image Preview', category: 'media', description: 'View the configured menu image asset.' },
  { id: 'video', title: 'Video Preview', category: 'media', description: 'View a configured video asset when available.' },
  { id: 'textpro', title: 'TextPro Generator', category: 'media', description: 'Generate neon, metallic, 3D, and other text-effect images.' },
  { id: 'search', title: 'Search & Filters', category: 'tools', description: 'Search Telegram UI features and filter results.' },
  { id: 'progress', title: 'Progress UI Demo', category: 'tools', description: 'Preview an editable task progress status.' },
  { id: 'settings', title: 'Theme Settings', category: 'tools', description: 'Choose a text theme preset for the bot.' },
  { id: 'help', title: 'Help Center', category: 'tools', description: 'View Telegram transport commands and limits.' },
  { id: 'admin', title: 'Admin Dashboard', category: 'admin', description: 'View restricted, read-only runtime diagnostics.' },
]);

let preferences = loadPreferences();
let chatSettings = loadChatSettings();
const sessions = new Map();
const aiHistory = new Map();
const aiLastRequest = new Map();
const aiMinuteRequests = new Map();
let telegramToken = '';
let stopRequested = false;
let pollTask = null;
let currentPollController = null;
let startingPromise = null;
let updateOffset = loadUpdateOffset();
let updateOffsetBotId = loadUpdateOffsetBotId();
let backoffMs = 1000;
let startupRetryTimer = null;
let startupBackoffMs = 3000;
let commandProvider = null;

const state = {
  status: 'disabled',
  configured: false,
  username: null,
  botId: null,
  connectedAt: null,
  lastChangeAt: Date.now(),
  lastError: null,
};

function publishState(patch) {
  Object.assign(state, patch, { lastChangeAt: Date.now() });
  global.__ABIX_TELEGRAM_STATE = { ...state };
}

function loadUpdateOffset() {
  try {
    const parsed = JSON.parse(fs.readFileSync(UPDATE_OFFSET_FILE, 'utf8'));
    return Number.isSafeInteger(parsed?.offset) && parsed.offset >= 0 ? parsed.offset : 0;
  } catch {
    return 0;
  }
}

function loadUpdateOffsetBotId() {
  try {
    const parsed = JSON.parse(fs.readFileSync(UPDATE_OFFSET_FILE, 'utf8'));
    return parsed?.botId == null ? null : String(parsed.botId);
  } catch {
    return null;
  }
}

function saveUpdateOffset() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temporary = `${UPDATE_OFFSET_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 2, botId: updateOffsetBotId, offset: updateOffset }), { mode: 0o600 });
    fs.renameSync(temporary, UPDATE_OFFSET_FILE);
  } catch (error) {
    console.error(`[Telegram] Could not save polling offset: ${error.message}`);
  }
}

function loadPreferences() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PREFERENCES_FILE, 'utf8'));
    const raw = parsed && typeof parsed.users === 'object' ? parsed.users : {};
    const out = new Map();
    for (const [userId, value] of Object.entries(raw).slice(-5000)) {
      if (!/^\d{1,24}$/.test(userId)) continue;
      const theme = THEMES[value?.theme] ? value.theme : 'cyber';
      out.set(userId, { theme, menuImage: value?.menuImage !== false, layout: value?.layout === 'list' ? 'list' : 'grid' });
    }
    return out;
  } catch {
    return new Map();
  }
}

function savePreferences() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    while (preferences.size > 5000) preferences.delete(preferences.keys().next().value);
    const users = Object.fromEntries(preferences.entries());
    const temporary = `${PREFERENCES_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, users }, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, PREFERENCES_FILE);
  } catch (error) {
    console.error(`[Telegram] Could not save UI preferences: ${error.message}`);
  }
}

function getPreference(userId) {
  const key = String(userId || '0');
  if (!preferences.has(key)) {
    const configuredLayout = String(process.env.TELEGRAM_DEFAULT_LAYOUT || 'grid').toLowerCase();
    preferences.set(key, {
      theme: process.env.TELEGRAM_DEFAULT_THEME && THEMES[process.env.TELEGRAM_DEFAULT_THEME] ? process.env.TELEGRAM_DEFAULT_THEME : 'cyber',
      menuImage: true,
      layout: configuredLayout === 'list' ? 'list' : 'grid',
    });
  }
  return preferences.get(key);
}

function loadChatSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CHAT_SETTINGS_FILE, 'utf8'));
    const raw = parsed && typeof parsed.chats === 'object' ? parsed.chats : {};
    const out = new Map();
    for (const [chatId, value] of Object.entries(raw).slice(-5000)) {
      if (!/^-?\d{1,24}$/.test(chatId)) continue;
      out.set(chatId, { antiLink: value?.antiLink === true });
    }
    return out;
  } catch {
    return new Map();
  }
}

function saveChatSettings() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    while (chatSettings.size > 5000) chatSettings.delete(chatSettings.keys().next().value);
    const temporary = `${CHAT_SETTINGS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, chats: Object.fromEntries(chatSettings) }, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, CHAT_SETTINGS_FILE);
  } catch (error) {
    console.error(`[Telegram] Could not save chat settings: ${error.message}`);
  }
}

function getChatSettings(chatId) {
  const key = String(chatId);
  if (!chatSettings.has(key)) chatSettings.set(key, { antiLink: false });
  return chatSettings.get(key);
}

function isGroupChat(chat) {
  return chat?.type === 'group' || chat?.type === 'supergroup';
}

function isChannelChat(chat) {
  return chat?.type === 'channel';
}

function formatChatIds(message, requested = 'all') {
  const chat = message?.chat || {};
  const sender = message?.from || null;
  const replied = message?.reply_to_message?.from || null;
  const lines = [];
  if (requested === 'all' || requested === 'user') {
    const target = requested === 'user' && replied ? replied : sender;
    if (target?.id != null) {
      lines.push(`User ID: ${target.id}`);
      if (target.username) lines.push(`Username: @${target.username}`);
      if (replied && requested === 'user') lines.push('Target: replied-to user');
    } else if (requested === 'user') {
      lines.push('User ID is not available for a channel post. Run /userid in a user or group chat.');
    }
  }
  if (requested === 'all' || requested === 'chat') {
    if (chat.id != null) lines.push(`${isChannelChat(chat) ? 'Channel' : isGroupChat(chat) ? 'Group' : 'Chat'} ID: ${chat.id}`);
    if (chat.type) lines.push(`Chat type: ${chat.type}`);
    if (chat.title) lines.push(`Title: ${chat.title}`);
    if (chat.username) lines.push(`Public username: @${chat.username}`);
  }
  if (requested === 'group') {
    if (isGroupChat(chat)) {
      lines.push(`Group ID: ${chat.id}`);
      if (chat.title) lines.push(`Group name: ${chat.title}`);
    } else lines.push('Use /groupid inside a group or supergroup.');
  }
  if (requested === 'channel') {
    if (isChannelChat(chat)) {
      lines.push(`Channel ID: ${chat.id}`);
      if (chat.title) lines.push(`Channel name: ${chat.title}`);
      if (chat.username) lines.push(`Channel username: @${chat.username}`);
    } else lines.push('Use /channelid inside a channel. The bot must be added to that channel.');
  }
  if (message?.sender_chat?.id != null && message.sender_chat.id !== chat.id) lines.push(`Sender chat ID: ${message.sender_chat.id}`);
  return `🆔 TELEGRAM ID FINDER\n━━━━━━━━━━━━━━━━\n${lines.length ? lines.join('\n') : 'No Telegram IDs are available in this update.'}`;
}

function hasLink(message) {
  const text = String(message?.text || message?.caption || '');
  const entities = [...(message?.entities || []), ...(message?.caption_entities || [])];
  return entities.some(entity => entity.type === 'url' || entity.type === 'text_link') || /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i.test(text);
}

function getSession(chatId, userId) {
  const key = `${chatId}:${userId}`;
  if (!sessions.has(key)) {
    sessions.set(key, { mode: null, query: '', filter: 'all', sort: 'relevance', page: 0, touchedAt: Date.now() });
  }
  const session = sessions.get(key);
  session.touchedAt = Date.now();
  return session;
}

const sessionSweep = setInterval(() => {
  const staleBefore = Date.now() - 2 * 60 * 60 * 1000;
  for (const [key, value] of sessions) if (value.touchedAt < staleBefore) sessions.delete(key);
  for (const [key, value] of aiHistory) if (value.touchedAt < staleBefore) aiHistory.delete(key);
  for (const [key, value] of aiLastRequest) if (value < Date.now() - 60 * 60 * 1000) aiLastRequest.delete(key);
  for (const [key, value] of aiMinuteRequests) if (value.startedAt < Date.now() - 60 * 1000) aiMinuteRequests.delete(key);
}, 10 * 60 * 1000);
sessionSweep.unref?.();

// Optional Telegram group/channel join-request automation. It is intentionally
// disabled by default; use a chat-ID allowlist for explicit production scope.
function autoApproveJoinRequestsEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.TELEGRAM_AUTO_APPROVE_JOIN_REQUESTS || '').trim());
}

function parseAutoApproveChatIds() {
  return new Set(String(process.env.TELEGRAM_AUTO_APPROVE_CHAT_IDS || '')
    .split(/[\s,]+/)
    .map(value => value.trim())
    .filter(value => /^-?\d{1,24}$/.test(value)));
}

function shouldAutoApproveJoinRequest(chatId) {
  if (!autoApproveJoinRequestsEnabled()) return false;
  const allowlist = parseAutoApproveChatIds();
  return allowlist.size === 0 || allowlist.has(String(chatId));
}

function getAllowedUpdates() {
  // Subscribe explicitly to all update types used by this transport.
  // channel_post powers /channelid; inline_query powers @bot search.
  const updates = ['message', 'callback_query', 'channel_post', 'inline_query'];
  if (autoApproveJoinRequestsEnabled()) updates.push('chat_join_request');
  return updates;
}

function getTelegramStatus() {
  const configured = Boolean(String(process.env.TELEGRAM_BOT_TOKEN || '').trim());
  return {
    configured,
    status: configured && state.status === 'disabled' ? 'starting' : (state.status || (configured ? 'starting' : 'disabled')),
    username: state.username || null,
    connectedAt: state.connectedAt || null,
    lastChangeAt: state.lastChangeAt || null,
    autoApproveJoinRequests: autoApproveJoinRequestsEnabled(),
    autoApproveChatAllowlistCount: parseAutoApproveChatIds().size,
    lastError: state.lastError || null,
  };
}

function parseAdminIds() {
  return new Set(String(process.env.TELEGRAM_ADMIN_IDS || '')
    .split(/[\s,]+/)
    .map(value => value.trim())
    .filter(value => /^\d{1,24}$/.test(value)));
}

function isAdmin(userId) {
  return parseAdminIds().has(String(userId || ''));
}

function safeText(value, maxLength = MAX_MESSAGE_LENGTH) {
  const text = String(value ?? '').replace(/\u0000/g, '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function themeHeader(userId, title) {
  const themeKey = getPreference(userId).theme;
  const theme = THEMES[themeKey] || THEMES.cyber;
  return `${theme.icon} ABIX // ${title}\n${theme.divider}`;
}

function button(text, callbackData) {
  if (Buffer.byteLength(callbackData, 'utf8') > MAX_CALLBACK_BYTES) {
    throw new Error(`Telegram callback data exceeds ${MAX_CALLBACK_BYTES} bytes: ${callbackData}`);
  }
  return { text, callback_data: callbackData };
}

function inlineKeyboard(rows) {
  return { inline_keyboard: rows.filter(row => Array.isArray(row) && row.length) };
}

function urlButton(text, url) {
  return { text, url };
}

function getMiniAppUrl() {
  const raw = String(process.env.TELEGRAM_WEBAPP_URL || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function getReplyKeyboard() {
  return {
    keyboard: [
      [{ text: '🏠 Menu' }, { text: '🔎 Search' }],
      [{ text: '🆔 My ID' }, { text: '🎬 Media' }],
      [{ text: '⚙️ Settings' }, { text: '❓ Help' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Choose an action',
  };
}

function homeKeyboard(userId) {
  // Grid is compact by default. Users can switch to full-width rows in Settings.
  const gridRows = [
    [button('🤖 AI', 'menu:ai'), button('🎬 MEDIA', 'menu:media')],
    [button('🔎 SEARCH', 'menu:search'), button('⚙️ SETTINGS', 'menu:settings')],
    [button('🪄 TEXT PRO', 'tp:menu'), button('🌈 EPHOTO360', 'sfx:menu:ephoto')],
    [button('🎂 BIRTHDAY', 'sfx:menu:birthdaycake'), button('🎮 TOOLS', 'menu:tools')],
    [button('🗂️ ALBUM', 'media:album'), button('🆔 FIND ID', 'menu:ids')],
    [button('⋯ MORE', 'menu:more'), button('❓ HELP', 'menu:help')],
  ];
  if (isAdmin(userId)) gridRows.push([button('🛡️ ADMIN CORE', 'menu:admin')]);
  if (getPreference(userId).layout === 'list') {
    return inlineKeyboard(gridRows.flatMap(row => row.map(item => [item])));
  }
  return inlineKeyboard(gridRows);
}

function homeText(userId) {
  return [
    themeHeader(userId, 'SYSTEM CONTROL'),
    '',
    'Choose a module below.',
    'WhatsApp + Telegram',
    'STATUS: READY',
  ].join('\n');
}

function navigationKeyboard(userId, extraRows = []) {
  return inlineKeyboard([
    ...extraRows,
    [button('⬅️ BACK', 'nav:back'), button('⌂ HOME', 'menu:home')],
  ]);
}

function pageKeyboard(userId, pageKey, chatId = null, chatType = null) {
  if (pageKey === 'ai') {
    return navigationKeyboard(userId, [[button('💬 Ask Gemini', 'ai:prompt')], [button('🧠 Clear chat history', 'ai:clear')]]);
  }
  if (pageKey === 'media') {
    return navigationKeyboard(userId, [
      [button('🖼️ IMAGE CARD', 'media:image'), button('🎞️ VIDEO CARD', 'media:video')],
      [button('🗂️ SEND MEDIA ALBUM', 'media:album')],
      [button('⏳ PROGRESS UI DEMO', 'job:demo')],
      [button('🪄 TEXTPRO TEMPLATES', 'tp:menu')],
    ]);
  }
  if (pageKey === 'settings') {
    const preference = getPreference(userId);
    const rows = [
      [button(preference.theme === 'cyber' ? '✓ ⚡ Neon Cyber' : '⚡ Neon Cyber', 'theme:cyber'), button(preference.theme === 'matrix' ? '✓ 🟢 Matrix' : '🟢 Matrix', 'theme:matrix')],
      [button(preference.theme === 'minimal' ? '✓ ◇ Minimal' : '◇ Minimal', 'theme:minimal')],
      [button(`Menu image: ${preference.menuImage ? 'ON 🟢' : 'OFF ⚫'}`, 'settings:toggle:image')],
      [button(`Button layout: ${preference.layout === 'list' ? 'Full-width rows' : 'Two-column grid'}`, 'settings:toggle:layout')],
    ];
    if (chatId && (chatType === 'group' || chatType === 'supergroup')) rows.push([button(`Group Anti-Link: ${getChatSettings(chatId).antiLink ? 'ON 🟢' : 'OFF 🔴'}`, 'chatsettings:antilink')]);
    return navigationKeyboard(userId, rows);
  }
  if (pageKey === 'more') {
    return navigationKeyboard(userId, [
      [button('⌨️ Reply Keyboard', 'ui:replykeyboard'), button('🔗 Quick Links', 'menu:links')],
      [button('📱 Mini App', 'ui:app'), button('🔎 Inline Mode', 'ui:inline')],
    ]);
  }
  if (pageKey === 'tools') {
    return navigationKeyboard(userId, [
      [button('🔎 Search features', 'menu:search')],
      [button('🖼️ Image preview', 'media:image'), button('🎞️ Video preview', 'media:video')],
      [button('⏳ Progress demo', 'job:demo')],
    ]);
  }
  if (pageKey === 'help') {
    return navigationKeyboard(userId, [[button('📚 Browse features', 'menu:search')], [button('💬 Ask AI', 'menu:ai')]]);
  }
  if (pageKey === 'ids') {
    return navigationKeyboard(userId, [
      [button('🆔 All IDs', 'id:all'), button('👤 User ID', 'id:user')],
      [button('💬 Chat ID', 'id:chat'), button('👥 Group ID', 'id:group')],
      [button('📢 Channel ID', 'id:channel')],
    ]);
  }
  if (pageKey === 'search') {
    const searchState = chatId == null
      ? { filter: 'all', sort: 'relevance', page: 0, totalPages: 1 }
      : getSession(chatId, userId);
    return searchKeyboard(userId, searchState);
  }
  return homeKeyboard(userId);
}

function pageContent(userId, pageKey, chatId = null, chatType = null) {
  const pages = {
    ai: `${themeHeader(userId, 'AI ENGINE')}\n\nPowered by the bot's configured Gemini backend.\nTap Ask Gemini, then send your prompt in this private chat.`,
    media: `${themeHeader(userId, 'MEDIA LAB')}\n\nOpen a configured image/video card, preview progress UI, or generate effects with TextPro.me, Ephoto360 English, and BirthdayCake24.\nMedia files are loaded from local assets or TELEGRAM_MENU_IMAGE / TELEGRAM_MENU_VIDEO.`,
    settings: `${themeHeader(userId, 'SYSTEM SETTINGS')}\n\nTheme: ${THEMES[getPreference(userId).theme].name}\nLayout: ${getPreference(userId).layout === 'list' ? 'Full-width rows' : 'Two-column grid'}\nMenu image: ${getPreference(userId).menuImage ? 'ON' : 'OFF'}${chatId && (chatType === 'group' || chatType === 'supergroup') ? `\nGroup Anti-Link: ${getChatSettings(chatId).antiLink ? 'ON' : 'OFF'}` : ''}\n\nNative button colours are client-controlled.`,
    tools: `${themeHeader(userId, 'TOOLS')}\n\nSearch the supported Telegram feature catalogue, preview media, or test progress updates.`,
    more: `${themeHeader(userId, 'MORE TOOLS')}\n\nReply keyboard, quick links, inline search, and the optional Mini App.`,
    help: `${themeHeader(userId, 'HELP CENTER')}\n\n/start — animated welcome\n/menu — main menu\n/ask [prompt] — ask Gemini\n/search [query] — search supported Telegram features\n/textpro — multi-site effect generator menu\n/ephoto — Ephoto360 generator menu\n/birthdaycake — BirthdayCake24 generator menu\n/tppopular / /tpnew / /tpsearch — TextPro discovery\n/epopular / /epnew / /epsearch — Ephoto360 discovery\n/bcpopular / /bcnew / /bcsearch — BirthdayCake24 discovery\n/status — dual-transport health\n/settings — theme presets\n/id, /userid, /chatid, /groupid, /channelid — find Telegram IDs\n/keyboard — show quick reply keyboard; /hidekeyboard — hide it\n/album — send a media album\n/inline — show inline-mode usage\n/links — quick deep links; /app — optional Mini App\n/admin — restricted diagnostics\n/scmusic — SoundCloud commands\n/scsearch — search tracks\n/scdownload, /scplaylist, /scuser, /sclikes — official downloads\n\nInline mode must be enabled with @BotFather. Mini App requires an HTTPS URL in TELEGRAM_WEBAPP_URL. WhatsApp-only plugins are not automatically ported.`,
    search: `${themeHeader(userId, 'SEARCH DATABASE')}\n\nSearch Telegram-supported features and filter the results.\nUse Search now to enter a query.`,
    ids: `${themeHeader(userId, 'ID FINDER')}\n\nGet Telegram user, chat, group, and channel IDs.\n\nCommands: /id /userid /chatid /groupid /channelid`,
    links: `${themeHeader(userId, 'QUICK LINKS')}\n\nOpen a bot section directly using Telegram deep links.`,
  };
  return pages[pageKey] || homeText(userId);
}

async function telegramApi(method, payload = {}, options = {}) {
  const token = String(telegramToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('Telegram bot token is not configured.');
  const controller = options.signal ? null : new AbortController();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 15000);
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: options.signal || controller.signal,
    });
    let body;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || !body?.ok) {
      const description = safeText(body?.description || `Telegram API HTTP ${response.status}`, 220);
      const error = new Error(description);
      error.telegramErrorCode = Number(body?.error_code || response.status || 0);
      throw error;
    }
    return body.result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function telegramMultipart(method, fields, fileField, filePath, mimeType) {
  const token = String(telegramToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('Telegram bot token is not configured.');
  const absolute = path.resolve(ROOT, filePath);
  const stat = fs.statSync(absolute);
  const maxBytes = Math.max(1024 * 1024, Number(process.env.TELEGRAM_MEDIA_MAX_BYTES) || 20 * 1024 * 1024);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error(`Media file is missing or exceeds ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const bytes = fs.readFileSync(absolute);
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value && typeof value === 'object') form.set(key, JSON.stringify(value));
    else form.set(key, String(value));
  }
  form.set(fileField, new Blob([bytes], { type: mimeType }), path.basename(absolute));
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(30000),
  });
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || !body?.ok) throw new Error(safeText(body?.description || `Telegram media API HTTP ${response.status}`, 220));
  return body.result;
}

async function sendMessage(chatId, text, markup, extra = {}) {
  return telegramApi('sendMessage', {
    chat_id: chatId,
    text: safeText(text),
    disable_web_page_preview: true,
    ...(markup ? { reply_markup: markup } : {}),
    ...extra,
  });
}

async function sendHome(chatId, userId, preferImage = true) {
  const caption = safeText(homeText(userId), MAX_CAPTION_LENGTH);
  const markup = homeKeyboard(userId);
  preferImage = preferImage && getPreference(userId).menuImage !== false;
  if (preferImage) {
    const source = String(process.env.TELEGRAM_MENU_IMAGE || 'assets/bot_top_image.jpg').trim();
    try {
      if (/^https?:\/\//i.test(source) || (source && fs.existsSync(path.resolve(ROOT, source)))) {
        if (/^https?:\/\//i.test(source)) {
          return await telegramApi('sendPhoto', { chat_id: chatId, photo: source, caption, reply_markup: markup });
        }
        return await telegramMultipart('sendPhoto', { chat_id: chatId, caption, reply_markup: markup }, 'photo', source, source.toLowerCase().endsWith('.webp') ? 'image/webp' : source.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
      }
      // A non-path value can be an already uploaded Telegram file_id.
      if (source && !source.includes('/') && !source.includes('\\')) {
        return await telegramApi('sendPhoto', { chat_id: chatId, photo: source, caption, reply_markup: markup });
      }
    } catch (error) {
      console.warn(`[Telegram] Menu image fallback: ${error.message}`);
    }
  }
  return sendMessage(chatId, homeText(userId), markup);
}

async function editScreen(chatId, message, userId, text, markup) {
  const messageId = message?.message_id;
  if (!messageId) return sendMessage(chatId, text, markup);
  const isMedia = Boolean(message.photo || message.video || message.animation || message.document);
  try {
    if (isMedia) {
      await telegramApi('editMessageCaption', {
        chat_id: chatId,
        message_id: messageId,
        caption: safeText(text, MAX_CAPTION_LENGTH),
        reply_markup: markup,
      });
    } else {
      await telegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: safeText(text),
        disable_web_page_preview: true,
        reply_markup: markup,
      });
    }
    return { ...(message || {}), message_id: messageId, edited: true };
  } catch (error) {
    if (/message is not modified/i.test(error.message)) return { ...(message || {}), message_id: messageId, edited: true };
    // Disable stale buttons before falling back to a new message.
    try { await telegramApi('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: inlineKeyboard([]) }); } catch {}
    return sendMessage(chatId, text, markup);
  }
}

async function showPage(chatId, message, userId, pageKey) {
  const activeSession = getSession(chatId, userId);
  if (activeSession.currentScreen && activeSession.currentScreen !== pageKey) activeSession.previousScreen = activeSession.currentScreen;
  activeSession.currentScreen = pageKey;
  if (pageKey === 'admin' && (!isAdmin(userId) || message?.chat?.type !== 'private')) {
    return sendMessage(chatId, '⛔ Admin dashboard is available only to configured Telegram admins in a private chat.');
  }
  return editScreen(chatId, message, userId, pageContent(userId, pageKey, chatId, message?.chat?.type), pageKeyboard(userId, pageKey, chatId, message?.chat?.type));
}

async function sendMediaAlbum(chatId, userId) {
  const raw = String(process.env.TELEGRAM_ALBUM_MEDIA || 'assets/card1.png,assets/card2.png,assets/card3.png');
  const sources = raw.split(',').map(value => value.trim()).filter(Boolean).slice(0, 10);
  if (sources.length < 2) {
    return sendMessage(chatId,
      `${themeHeader(userId, 'MEDIA ALBUM')}\n\nSet TELEGRAM_ALBUM_MEDIA to 2–10 comma-separated local paths, public HTTPS URLs, or Telegram file IDs.`,
      navigationKeyboard(userId, [[button('🎬 MEDIA LAB', 'menu:media')]]));
  }

  const maxBytes = Math.max(1024 * 1024, Number(process.env.TELEGRAM_MEDIA_MAX_BYTES) || 20 * 1024 * 1024);
  const form = new FormData();
  form.set('chat_id', String(chatId));
  const media = [];
  let attachmentIndex = 0;

  for (let index = 0; index < sources.length; index++) {
    let source = sources[index];
    let forcedType = '';
    const prefix = source.match(/^(photo|video):(.*)$/i);
    if (prefix) {
      forcedType = prefix[1].toLowerCase();
      source = prefix[2].trim();
    }
    const isLocal = source && !/^https?:\/\//i.test(source) && (source.includes('/') || source.includes('\\')) && fs.existsSync(path.resolve(ROOT, source));
    const localPath = isLocal ? path.resolve(ROOT, source) : '';
    const relative = localPath ? path.relative(ROOT, localPath) : '';
    if (localPath && (relative.startsWith('..') || path.isAbsolute(relative))) {
      throw new Error('Album media paths must be inside the project directory.');
    }
    const type = forcedType || (/\.(mp4|mov|m4v|webm)(?:[?#].*)?$/i.test(source) ? 'video' : 'photo');
    const item = { type, media: source };

    if (localPath) {
      const stat = fs.statSync(localPath);
      if (!stat.isFile() || stat.size > maxBytes) throw new Error(`Album file ${path.basename(localPath)} is missing or exceeds the configured media limit.`);
      const fileKey = `albumfile${attachmentIndex++}`;
      const mimeType = type === 'video' ? 'video/mp4' : source.toLowerCase().endsWith('.png') ? 'image/png' : source.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      form.set(fileKey, new Blob([fs.readFileSync(localPath)], { type: mimeType }), path.basename(localPath));
      item.media = `attach://${fileKey}`;
    }

    if (index === 0) item.caption = `${themeHeader(userId, 'MEDIA ALBUM')}\nNeon Cyber gallery • ${sources.length} items`;
    media.push(item);
  }

  form.set('media', JSON.stringify(media));
  const token = String(telegramToken || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(45000),
  });
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || !body?.ok) throw new Error(safeText(body?.description || `Telegram media group HTTP ${response.status}`, 220));
  return sendMessage(chatId, '🗂️ Album sent. Choose what to do next:', navigationKeyboard(userId, [
    [button('🖼️ Image card', 'media:image'), button('🎞️ Video card', 'media:video')],
    [button('🔎 Search', 'menu:search')],
  ]));
}

async function isChatAdministrator(chatId, userId) {
  try {
    const member = await telegramApi('getChatMember', { chat_id: chatId, user_id: userId });
    return member?.status === 'creator' || member?.status === 'administrator';
  } catch {
    return false;
  }
}

async function botCanDeleteMessages(chatId) {
  if (!state.botId) return false;
  try {
    const member = await telegramApi('getChatMember', { chat_id: chatId, user_id: state.botId });
    return member?.status === 'creator' || (member?.status === 'administrator' && member?.can_delete_messages === true);
  } catch {
    return false;
  }
}

async function moderateLinkMessage(message) {
  if (!message?.chat || !message?.from || !isGroupChat(message.chat)) return false;
  const settings = getChatSettings(message.chat.id);
  if (!settings.antiLink || !hasLink(message)) return false;
  if (await isChatAdministrator(message.chat.id, message.from.id)) return false;
  if (!await botCanDeleteMessages(message.chat.id)) {
    console.warn(`[Telegram] Anti-Link is enabled in ${message.chat.id}, but bot delete permission is missing.`);
    return false;
  }
  try {
    await telegramApi('deleteMessage', { chat_id: message.chat.id, message_id: message.message_id });
    return true;
  } catch (error) {
    console.warn(`[Telegram] Could not delete linked message in ${message.chat.id}: ${safeText(error.message, 180)}`);
    return false;
  }
}

async function sendQuickLinks(chatId, userId) {
  if (!state.username) return sendMessage(chatId, 'Telegram bot identity is not ready yet. Try /links again in a moment.', navigationKeyboard(userId));
  const base = `https://t.me/${state.username}?start=`;
  const rows = [
    [urlButton('🏠 Main Menu', `${base}home`), urlButton('🎬 Media', `${base}media`)],
    [urlButton('🔎 Search', `${base}search`), urlButton('🪄 TextPro', `${base}textpro`)],
    [urlButton('🌈 Ephoto360', `${base}ephoto`), urlButton('🎂 BirthdayCake', `${base}birthdaycake`)],
    [urlButton('🆔 ID Finder', `${base}ids`)],
  ];
  return sendMessage(chatId, `${themeHeader(userId, 'QUICK LINKS')}\n\nTap a link to open that section directly.`, inlineKeyboard(rows));
}

async function sendMiniApp(chatId, userId, chatType) {
  const url = getMiniAppUrl();
  if (!url) return sendMessage(chatId, 'Mini App is not configured. Set TELEGRAM_WEBAPP_URL to an HTTPS URL.', navigationKeyboard(userId));
  if (chatType !== 'private') return sendMessage(chatId, 'Open the bot in a private chat and use /app to launch the Mini App.', navigationKeyboard(userId));
  return sendMessage(chatId, `${themeHeader(userId, 'NEON MINI APP')}\n\nLaunch the optional web interface.`, inlineKeyboard([
    [{ text: '🚀 LAUNCH MINI APP', web_app: { url } }],
    [button('⌂ HOME', 'menu:home')],
  ]));
}

async function sendMediaCard(chatId, userId, type) {
  const isImage = type === 'image';
  const field = isImage ? 'TELEGRAM_MENU_IMAGE' : 'TELEGRAM_MENU_VIDEO';
  const defaultSource = isImage ? 'assets/bot_top_image.jpg' : 'assets/bot_top.mp4';
  const source = String(process.env[field] || defaultSource).trim();
  const caption = `${themeHeader(userId, isImage ? 'IMAGE CARD' : 'VIDEO CARD')}\n\n${isImage ? 'Neon Cyber image preview.' : 'Neon Cyber video preview.'}\nSource: configured bot asset.`;
  const markup = inlineKeyboard([
    [button('🔎 SEARCH', 'menu:search'), button('🎬 MEDIA LAB', 'menu:media')],
    [button('⌂ HOME', 'menu:home')],
  ]);
  try {
    const method = isImage ? 'sendPhoto' : 'sendVideo';
    const mediaKey = isImage ? 'photo' : 'video';
    if (/^https?:\/\//i.test(source) || (!source.includes('/') && !source.includes('\\') && !fs.existsSync(path.resolve(ROOT, source)))) {
      return await telegramApi(method, { chat_id: chatId, [mediaKey]: source, caption: safeText(caption, MAX_CAPTION_LENGTH), reply_markup: markup });
    }
    if (!fs.existsSync(path.resolve(ROOT, source))) {
      return sendMessage(chatId, `${themeHeader(userId, isImage ? 'IMAGE CARD' : 'VIDEO CARD')}\n\nNo local asset was found. Configure ${field} as a local path, public HTTPS URL, or Telegram file_id.`, markup);
    }
    const mimeType = isImage ? (source.toLowerCase().endsWith('.webp') ? 'image/webp' : source.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg') : 'video/mp4';
    return await telegramMultipart(method, { chat_id: chatId, caption: safeText(caption, MAX_CAPTION_LENGTH), reply_markup: markup }, mediaKey, source, mimeType);
  } catch (error) {
    return sendMessage(chatId, `⚠️ Could not send the media card: ${safeText(error.message, 180)}`, markup);
  }
}

function featureVisible(feature, userId) {
  return feature.category !== 'admin' || isAdmin(userId);
}

function searchKeyboard(userId, session) {
  const filterLabel = session.filter === 'media' ? 'MEDIA' : session.filter === 'tools' ? 'TOOLS' : session.filter === 'admin' ? 'ADMIN' : 'ALL';
  return inlineKeyboard([
    [button('🔎 Search now', 'search:new')],
    [button(session.filter === 'all' ? '✓ All' : 'All', 'search:filter:all'), button(session.filter === 'media' ? '✓ Media' : 'Media', 'search:filter:media'), button(session.filter === 'tools' ? '✓ Tools' : 'Tools', 'search:filter:tools')],
    ...(isAdmin(userId) ? [[button(session.filter === 'admin' ? '✓ Admin' : 'Admin', 'search:filter:admin')]] : []),
    [button(session.sort === 'az' ? 'Sort: A–Z ✓' : 'Sort: A–Z', 'search:sort:az')],
    [button('⬅️ Previous', `search:page:${Math.max(0, session.page - 1)}`), button(`${session.page + 1} / ${Math.max(1, session.totalPages || 1)}`, 'search:noop'), button('Next ➡️', `search:page:${Math.min(Math.max(0, session.totalPages || 1) - 1, session.page + 1)}`)],
    [button('⌂ HOME', 'menu:home')],
  ]);
}

function renderSearchResults(userId, session) {
  let results = FEATURES.filter(feature => featureVisible(feature, userId));
  if (session.query) {
    const q = session.query.toLowerCase();
    results = results.filter(feature => `${feature.title} ${feature.description} ${feature.category}`.toLowerCase().includes(q));
  }
  if (session.filter !== 'all') results = results.filter(feature => feature.category === session.filter);
  if (session.sort === 'az') results = results.slice().sort((a, b) => a.title.localeCompare(b.title));

  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  session.totalPages = totalPages;
  session.page = Math.min(Math.max(0, Number(session.page) || 0), totalPages - 1);
  const pageResults = results.slice(session.page * pageSize, session.page * pageSize + pageSize);
  const itemRows = pageResults.map(feature => [button(`${feature.category === 'media' ? '🎬' : feature.category === 'admin' ? '🛡️' : '✦'} ${feature.title}`, `feature:${feature.id}`)]);
  const body = pageResults.length
    ? pageResults.map((feature, index) => `${session.page * pageSize + index + 1}. ${feature.title}\n   ${feature.description}`).join('\n\n')
    : 'No features matched. Clear the search or change the filter.';
  return {
    text: `${themeHeader(userId, 'SEARCH RESULTS')}\n\nQuery: ${session.query || '(all features)'}\nFilter: ${String(session.filter).toUpperCase()} • Sort: ${session.sort === 'az' ? 'A–Z' : 'Default'}\n\n${body}`,
    markup: inlineKeyboard([
      ...itemRows,
      [button('🔎 Search', 'search:new')],
      [button(session.filter === 'all' ? '✓ All' : 'All', 'search:filter:all'), button(session.filter === 'media' ? '✓ Media' : 'Media', 'search:filter:media'), button(session.filter === 'tools' ? '✓ Tools' : 'Tools', 'search:filter:tools')],
      ...(isAdmin(userId) ? [[button(session.filter === 'admin' ? '✓ Admin' : 'Admin', 'search:filter:admin')]] : []),
      [button(session.sort === 'az' ? 'Sort: A–Z ✓' : 'Sort: A–Z', 'search:sort:az')],
      [button('⬅️ Previous', `search:page:${Math.max(0, session.page - 1)}`), button(`${session.page + 1} / ${totalPages}`, 'search:noop'), button('Next ➡️', `search:page:${Math.min(totalPages - 1, session.page + 1)}`)],
      [button('⌂ HOME', 'menu:home')],
    ]),
  };
}

async function showSearchResults(chatId, message, userId) {
  const searchSession = getSession(chatId, userId);
  const result = renderSearchResults(userId, searchSession);
  return editScreen(chatId, message, userId, result.text, result.markup);
}

async function startSearch(chatId, message, userId, query = '') {
  const searchSession = getSession(chatId, userId);
  searchSession.mode = query ? null : 'search';
  searchSession.query = safeText(query, 100);
  searchSession.filter = 'all';
  searchSession.sort = 'relevance';
  searchSession.page = 0;
  if (!query) {
    return editScreen(chatId, message, userId, `${themeHeader(userId, 'SEARCH INPUT')}\n\nSend a search term in this chat. Search covers Telegram-supported features only.`, navigationKeyboard(userId, [[button('Cancel', 'menu:search')]]));
  }
  return showSearchResults(chatId, message, userId);
}

function formatRuntimeStatus(userId) {
  const whatsapp = global.__ABIX_WEB_STATE || {};
  let gemini = {};
  try { gemini = require('./geminiService').status() || {}; } catch { gemini = {}; }
  const memory = process.memoryUsage();
  const telegram = getTelegramStatus();
  return [
    themeHeader(userId, 'DUAL-TRANSPORT STATUS'),
    '',
    `WhatsApp: ${whatsapp.status || 'starting'}`,
    `Telegram: ${telegram.status}`,
    `Telegram configured: ${telegram.configured ? 'yes' : 'no'}`,
    `Telegram username: ${telegram.username ? '@' + telegram.username : 'not confirmed'}`,
    ...(telegram.lastError ? [`Telegram last error: ${telegram.lastError}`] : []),
    `Gemini backend: ${gemini.backend || 'unknown'}`,
    `Gemini running: ${gemini.running === true ? 'yes' : gemini.running === false ? 'no' : 'unknown'}`,
    `Process uptime: ${Math.floor(process.uptime())} seconds`,
    `RAM: ${Math.round(memory.rss / 1024 / 1024)} MB RSS`,
    `Node: ${process.version}`,
  ].join('\n');
}

async function showAdmin(chatId, message, userId) {
  if (!isAdmin(userId) || message?.chat?.type !== 'private') {
    return sendMessage(chatId, '⛔ Access denied. Set your numeric Telegram user ID in TELEGRAM_ADMIN_IDS. The admin dashboard only works in private chats.');
  }
  let inventory = [];
  try { inventory = commandProvider?.getCommandInventory?.() || []; } catch {}
  const text = `${themeHeader(userId, 'ADMIN CORE')}\n\nACCESS: AUTHORIZED\n\n${formatRuntimeStatus(userId)}\n\nWhatsApp plugin registry: ${inventory.length} commands\nWhatsApp plugin handlers are not automatically exposed as Telegram commands.`;
  const keyboard = navigationKeyboard(userId, [[button('🔄 Refresh diagnostics', 'admin:refresh')], [button('📚 Command registry summary', 'admin:commands')]]);
  if (message?.from?.id !== state.botId) return sendMessage(chatId, text, keyboard);
  return editScreen(chatId, message, userId, text, keyboard);
}

async function answerCallback(callbackQuery, text, showAlert = false) {
  if (!callbackQuery?.id) return;
  try { await telegramApi('answerCallbackQuery', { callback_query_id: callbackQuery.id, ...(text ? { text: safeText(text, 180) } : {}), show_alert: showAlert }); } catch {}
}

async function startAnimation(chatId, userId) {
  let message;
  try {
    message = await sendMessage(chatId, '⚡ ABIX // BOOT SEQUENCE 01\n[░░░░░░░░░░] 0%');
    const frames = [
      '⚡ ABIX // LOADING INTERFACE\n[███░░░░░░░] 30%',
      '⚡ ABIX // CONNECTING MODULES\n[███████░░░] 70%',
      '⚡ ABIX // SYSTEM READY\n[██████████] 100%',
    ];
    for (const frame of frames) {
      await new Promise(resolve => setTimeout(resolve, 240));
      try { await telegramApi('editMessageText', { chat_id: chatId, message_id: message.message_id, text: frame }); } catch {}
    }
    try { await telegramApi('deleteMessage', { chat_id: chatId, message_id: message.message_id }); } catch {}
  } catch (error) {
    console.warn(`[Telegram] Welcome animation skipped: ${error.message}`);
  }
  return sendHome(chatId, userId, true);
}

async function sendGeminiPrompt(chatId, userId, prompt) {
  if (String(chatId) !== String(userId)) {
    return sendMessage(chatId, 'For privacy, AI prompts are supported only in a private chat with this bot.');
  }
  const key = String(userId);
  const now = Date.now();
  const previous = aiLastRequest.get(key) || 0;
  if (now - previous < 2500) return sendMessage(chatId, '⏳ Please wait a moment before sending another AI request.');
  let window = aiMinuteRequests.get(key);
  if (!window || now - window.startedAt >= 60_000) window = { startedAt: now, count: 0 };
  if (window.count >= 8) return sendMessage(chatId, 'Rate limit reached: maximum 8 AI requests per minute.');
  window.count += 1;
  aiMinuteRequests.set(key, window);
  aiLastRequest.set(key, now);

  const cleanedPrompt = safeText(prompt, Math.max(1000, Number(process.env.TELEGRAM_AI_MAX_PROMPT_CHARS) || 6000));
  if (!cleanedPrompt) return sendMessage(chatId, 'Send a non-empty prompt.');

  const loading = await sendMessage(chatId, `${themeHeader(userId, 'NEURAL ENGINE')}\n\n⏳ Processing your prompt...`);
  try {
    const { generateResponse } = require('./geminiService');
    const historyEntry = aiHistory.get(key) || { messages: [], touchedAt: now };
    const answer = await generateResponse(historyEntry.messages, cleanedPrompt, {
      maxOutputTokens: Number(process.env.TELEGRAM_AI_MAX_OUTPUT_TOKENS) || 1500,
      temperature: 0.7,
    });
    const messages = [...historyEntry.messages, { role: 'user', content: cleanedPrompt }, { role: 'assistant', content: safeText(answer, 8000) }].slice(-12);
    aiHistory.set(key, { messages, touchedAt: Date.now() });
    const chunks = splitText(safeText(answer, 12000), 3800);
    const firstChunk = chunks.shift() || 'No response returned.';
    try {
      await telegramApi('editMessageText', { chat_id: chatId, message_id: loading.message_id, text: firstChunk });
    } catch {
      await sendMessage(chatId, firstChunk);
    }
    for (const chunk of chunks) await sendMessage(chatId, chunk);
  } catch (error) {
    const message = error?.code === 'RATE_LIMIT'
      ? 'Gemini quota/rate limit reached. Try again later.'
      : error?.code === 'AUTH_ERROR'
        ? 'Gemini is not configured correctly. Check the bot server configuration.'
        : error?.code === 'TIMEOUT'
          ? 'The AI request timed out. Try a shorter prompt.'
          : 'The AI request failed. Check the Gemini service logs.';
    try { await telegramApi('editMessageText', { chat_id: chatId, message_id: loading.message_id, text: `⚠️ ${message}` }); }
    catch { await sendMessage(chatId, `⚠️ ${message}`); }
    console.error(`[Telegram AI] Request failed: ${error.message}`);
  }
}

function splitText(text, maxLength) {
  const chunks = [];
  let remaining = String(text || '');
  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf('\n', maxLength);
    if (cut < Math.floor(maxLength * 0.55)) cut = maxLength;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function progressDemo(chatId, userId) {
  const message = await sendMessage(chatId, `${themeHeader(userId, 'PROGRESS UI DEMO')}\n\nStatus: QUEUED\n[░░░░░░░░░░] 0%`, navigationKeyboard(userId));
  for (const percent of [20, 45, 70, 100]) {
    await new Promise(resolve => setTimeout(resolve, 650));
    const blocks = Math.floor(percent / 10);
    const bar = '█'.repeat(blocks) + '░'.repeat(10 - blocks);
    const statusText = percent === 100 ? 'COMPLETE' : 'PROCESSING';
    try {
      await telegramApi('editMessageText', {
        chat_id: chatId,
        message_id: message.message_id,
        text: `${themeHeader(userId, 'PROGRESS UI DEMO')}\n\nStatus: ${statusText}\n[${bar}] ${percent}%\n\nThis is a UI demonstration, not a real media job.`,
        reply_markup: navigationKeyboard(userId),
      });
    } catch (error) {
      if (!/message is not modified/i.test(error.message)) console.warn(`[Telegram] Progress UI update failed: ${error.message}`);
    }
  }
}

const TEXTPRO_COMMANDS = new Map(ALL_TEMPLATES.map(template => [template.command, template]));

function textProMenuKeyboard(userId) {
  return navigationKeyboard(userId, [
    [button('🔥 POPULAR TEMPLATES', 'tp:popular')],
    [button('🆕 NEW TEMPLATES', 'tp:new')],
    [button('🔎 SEARCH TEMPLATES', 'tp:search')],
    [button('🌈 EPHOTO360', 'sfx:menu:ephoto'), button('🎂 BIRTHDAY CAKE', 'sfx:menu:birthdaycake')],
    [button('⚡ QUICK NEON', 'tp:use:popular:0'), button('🟢 GREEN NEON', 'tp:use:popular:1')],
  ]);
}

function textProMenuText(userId) {
  return `${themeHeader(userId, 'TEXTPRO // TEXT EFFECT LAB')}\n\n` +
    'Generate neon, metallic, 3D, crystal, glitch, and other text artwork.\n\n' +
    'POPULAR  •  NEW  •  SEARCH  •  GENERATE\n\n' +
    '/tppopular — popular presets\n/tpnew — latest homepage entries\n/tpsearch <keyword> — live search\n' +
    '/ephoto — Ephoto360 English effects\n/birthdaycake — BirthdayCake24 greetings\n' +
    '/tpneon YOUR TEXT — direct generator\n/textpro neon | YOUR TEXT — choose any known preset';
}

function textProListText(userId, mode, items, page) {
  const pageSize = 6;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.max(0, Math.min(pages - 1, Number(page) || 0));
  const slice = items.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const title = mode === 'popular' ? 'POPULAR TEMPLATES' : mode === 'new' ? 'NEW / LATEST TEMPLATES' : 'SEARCH RESULTS';
  const body = slice.length
    ? slice.map((item, i) => `${currentPage * pageSize + i + 1}. ${item.title}${Number(item.inputs) > 1 ? ` (${item.inputs} text fields)` : ''}`).join('\n\n')
    : 'No templates found. Try another keyword.';
  const itemRows = slice.map((item, i) => {
    const index = currentPage * pageSize + i;
    const title = String(item.title || 'Text effect');
    return [button(`${index + 1}. ${title.length > 32 ? `${title.slice(0, 29)}…` : title}`, `tp:use:${mode}:${index}`)];
  });
  const markupRows = [
    ...itemRows,
    [button('⬅️ Previous', `tp:page:${mode}:${Math.max(0, currentPage - 1)}`), button(`${currentPage + 1}/${pages}`, 'tp:noop'), button('Next ➡️', `tp:page:${mode}:${Math.min(pages - 1, currentPage + 1)}`)],
    [button('🔥 Popular', 'tp:popular'), button('🆕 Latest', 'tp:new')],
    [button('🔎 Search', 'tp:search')],
    [button('⬅️ BACK', 'nav:back'), button('⌂ HOME', 'menu:home')],
  ];
  return {
    text: `${themeHeader(userId, title)}\n\nPage ${currentPage + 1}/${pages}\n\n${body}\n\nTap a template to enter your text.`,
    markup: inlineKeyboard(markupRows),
    page: currentPage,
    pages,
  };
}

async function showTextProMenu(chatId, message, userId) {
  const text = textProMenuText(userId);
  if (message?.message_id) return editScreen(chatId, message, userId, text, textProMenuKeyboard(userId));
  return sendMessage(chatId, text, textProMenuKeyboard(userId));
}

async function showTextProList(chatId, message, userId, mode, items, page = 0) {
  const session = getSession(chatId, userId);
  session.textProItems = items;
  session.textProListMode = mode;
  const rendered = textProListText(userId, mode, items, page);
  session.textProPage = rendered.page;
  return editScreen(chatId, message, userId, rendered.text, rendered.markup);
}

async function loadAndShowTextProList(chatId, message, userId, mode, query = '') {
  const loadingText = `${themeHeader(userId, mode === 'new' ? 'DISCOVERING NEW TEMPLATES' : 'SEARCHING TEXTPRO')}\n\n⏳ Loading templates from TextPro.me...`;
  const loading = message?.message_id
    ? await editScreen(chatId, message, userId, loadingText, navigationKeyboard(userId))
    : await sendMessage(chatId, loadingText, navigationKeyboard(userId));
  void (async () => {
    try {
      const items = mode === 'new'
        ? await getLatestTemplates({ refresh: false, limit: 30 })
        : await searchTextPro(query, 30);
      await showTextProList(chatId, loading, userId, mode, items, 0);
    } catch (error) {
      await editScreen(chatId, loading, userId,
        `${themeHeader(userId, 'TEXTPRO UNAVAILABLE')}\n\n${safeText(error.message, 220)}\n\nUse /tppopular for offline preset commands.`,
        navigationKeyboard(userId, [[button('🔥 Popular templates', 'tp:popular')]]));
    }
  })().catch(error => console.warn(`[Telegram TextPro] Catalog job failed: ${error.message}`));
  return loading;
}




async function showSiteFxMenu(chatId, message, userId, siteKey) {
  const site = getSiteConfig(siteKey);
  const text = `${themeHeader(userId, `${site.label.toUpperCase()} // EFFECT LAB`)}\n\n` +
    `Generate custom artwork using ${site.label}.\n\n` +
    `${site.popularCommand} — popular templates\n${site.newCommand} — latest templates\n${site.searchCommand} <keyword> — search\n\n` +
    `Individual effects have their own commands.\nExample: /${siteKey === 'ephoto' ? 'epmagic' : 'bdfireworks'} YOUR TEXT`;
  const markup = navigationKeyboard(userId, [
    [button('🔥 POPULAR EFFECTS', `sfx:popular:${siteKey}`)],
    [button('🆕 NEW / LATEST', `sfx:new:${siteKey}`)],
    [button('🔎 SEARCH EFFECTS', `sfx:search:${siteKey}`)],
    [button('📚 CATEGORIES', `sfx:categories:${siteKey}`)],
  ]);
  return editScreen(chatId, message, userId, text, markup);
}

function renderSiteFxList(userId, siteKey, mode, items, page = 0) {
  const pageSize = 6;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.max(0, Math.min(pages - 1, Number(page) || 0));
  const start = currentPage * pageSize;
  const slice = items.slice(start, start + pageSize);
  const site = getSiteConfig(siteKey);
  const title = mode === 'popular' ? 'POPULAR EFFECTS' : mode === 'new' ? 'NEW / LATEST EFFECTS' : 'SEARCH RESULTS';
  const body = slice.length
    ? slice.map((item, i) => `${start + i + 1}. ${item.title}${Number(item.inputs) > 1 ? ` (${item.inputs} text fields)` : ''}`).join('\n\n')
    : 'No effects found. Try another keyword or switch the filter.';
  const rows = slice.map((item, i) => {
    const label = `${start + i + 1}. ${String(item.title || 'Effect').slice(0, 29)}`;
    return [button(label, `sfx:use:${siteKey}:${mode}:${start + i}`)];
  });
  rows.push([
    button('⬅️ Previous', `sfx:page:${siteKey}:${mode}:${Math.max(0, currentPage - 1)}`),
    button(`${currentPage + 1}/${pages}`, 'sfx:noop'),
    button('Next ➡️', `sfx:page:${siteKey}:${mode}:${Math.min(pages - 1, currentPage + 1)}`),
  ]);
  rows.push([button('🔥 Popular', `sfx:popular:${siteKey}`), button('🆕 Latest', `sfx:new:${siteKey}`)]);
  rows.push([button('🔎 Search', `sfx:search:${siteKey}`), button('📚 Categories', `sfx:categories:${siteKey}`)]);
  rows.push([button('⬅️ BACK', `sfx:menu:${siteKey}`), button('⌂ HOME', 'menu:home')]);
  return {
    text: `${themeHeader(userId, `${site.shortLabel.toUpperCase()} // ${title}`)}\n\nPage ${currentPage + 1}/${pages}\n\n${body}\n\nTap an effect to enter your text.`,
    markup: inlineKeyboard(rows), page: currentPage, pages,
  };
}

async function showSiteFxList(chatId, message, userId, siteKey, mode, items, page = 0) {
  const session = getSession(chatId, userId);
  session.effectSiteKey = siteKey;
  session.effectSiteMode = mode;
  session.effectSiteItems = Array.isArray(items) ? items : [];
  const rendered = renderSiteFxList(userId, siteKey, mode, session.effectSiteItems, page);
  session.effectSitePage = rendered.page;
  return editScreen(chatId, message, userId, rendered.text, rendered.markup);
}

async function loadAndShowSiteFxList(chatId, message, userId, siteKey, mode, query = '') {
  const site = getSiteConfig(siteKey);
  const loadingText = `${themeHeader(userId, `${site.shortLabel.toUpperCase()} // LOADING`)}\n\n⏳ ${mode === 'new' ? 'Discovering latest effects' : 'Searching effects'}...`;
  const loading = message?.message_id
    ? await editScreen(chatId, message, userId, loadingText, navigationKeyboard(userId))
    : await sendMessage(chatId, loadingText, navigationKeyboard(userId));
  void (async () => {
    try {
      let items;
      if (mode === 'popular') items = getSiteTemplates(siteKey, 'popular');
      else if (mode === 'new') items = await getLatestTemplates({ refresh: false, limit: 30, site: siteKey });
      else items = await searchTextPro(query, 30, siteKey);
      await showSiteFxList(chatId, loading, userId, siteKey, mode, items, 0);
    } catch (error) {
      const fallback = getSiteTemplates(siteKey, mode === 'search' ? 'popular' : mode);
      await editScreen(chatId, loading, userId,
        `${themeHeader(userId, `${site.shortLabel.toUpperCase()} // UNAVAILABLE`)}\n\n${safeText(error.message, 220)}\n\nShowing saved presets where available.`,
        navigationKeyboard(userId, [[button('🔥 Open popular effects', `sfx:popular:${siteKey}`)]]));
      if (fallback.length) await showSiteFxList(chatId, loading, userId, siteKey, mode === 'search' ? 'popular' : mode, fallback, 0);
    }
  })().catch(error => console.warn(`[Telegram ${siteKey}] Catalog job failed: ${error.message}`));
  return loading;
}

function showSiteCategories(chatId, message, userId, siteKey) {
  const site = getSiteConfig(siteKey);
  return editScreen(chatId, message, userId,
    `${themeHeader(userId, `${site.shortLabel.toUpperCase()} // CATEGORIES`)}\n\n${site.categories.map((entry, i) => `${i + 1}. ${entry}`).join('\n')}\n\nUse /${site.searchCommand} <keyword> to search effects.`,
    navigationKeyboard(userId, [[button('🔥 Popular', `sfx:popular:${siteKey}`), button('🆕 Latest', `sfx:new:${siteKey}`)]]));
}

function promptTextPro(chatId, message, userId, template) {
  const session = getSession(chatId, userId);
  session.mode = 'textpro-generate';
  session.textProTemplate = {
    key: template.key, command: template.command || null, title: template.title,
    url: template.url, inputs: Number(template.inputs) || 1, group: template.group || 'custom',
    site: template.site || siteKeyForUrl(template.url) || 'textpro',
  };
  const usage = templateUsage(template, '/');
  const instruction = template.inputs > 1
    ? `Send exactly ${template.inputs} text fields separated by |.\nExample: ${template.inputs === 3 ? 'NAME ONE | NAME TWO | EXTRA TEXT' : 'MAIN TEXT | SMALL TEXT'}`
    : 'Send the text or name you want rendered.';
  const text = `${themeHeader(userId, 'TEXTPRO INPUT')}\n\nTemplate: ${template.title}\n\n${instruction}\n\nOr use command: ${usage}`;
  if (message?.message_id) return editScreen(chatId, message, userId, text, navigationKeyboard(userId, [[button('Cancel', 'tp:menu')]]));
  return sendMessage(chatId, text, navigationKeyboard(userId, [[button('Cancel', 'tp:menu')]]));
}

function parseTextProRequest(raw) {
  const input = String(raw || '').trim();
  if (!input) return null;
  const divider = input.indexOf('|');
  if (divider >= 0) return { target: input.slice(0, divider).trim(), text: input.slice(divider + 1).trim() };
  const firstSpace = input.search(/\s/);
  if (firstSpace < 0) return { target: input, text: '' };
  return { target: input.slice(0, firstSpace).trim(), text: input.slice(firstSpace + 1).trim() };
}

function textProPromptText(userId, template, texts) {
  return `${themeHeader(userId, 'EFFECT RENDERER')}\n\nSite: ${getSiteConfig(template.site || template.url).label}\nTemplate: ${template.title}\nText: ${texts.join(' / ')}\n\n⏳ Creating image. This can take up to a minute...`;
}

async function beginTextProGeneration(chatId, userId, template, rawText) {
  let texts;
  try {
    texts = splitTextFields(rawText, Number(template.inputs) || 1);
  } catch (error) {
    return sendMessage(chatId, `⚠️ ${safeText(error.message, 240)}\n\n${templateUsage(template, '/')}`, navigationKeyboard(userId));
  }
  const loading = await sendMessage(chatId, textProPromptText(userId, template, texts), navigationKeyboard(userId));
  // Run generation in the background so long rendering does not block Telegram polling.
  void (async () => {
    let tempRelative = null;
    try {
      let lastEditAt = 0;
      const result = await generateTextProImage(template, texts, `telegram:${chatId}:${userId}`, (stage) => {
        const now = Date.now();
        if (now - lastEditAt < 5000) return;
        lastEditAt = now;
        void telegramApi('editMessageText', {
          chat_id: chatId, message_id: loading.message_id,
          text: `${themeHeader(userId, 'EFFECT RENDERER')}\n\nSite: ${getSiteConfig(template.site || template.url).label}\nTemplate: ${template.title}\nText: ${texts.join(' / ')}\n\n⏳ ${safeText(stage, 180)}`,
          reply_markup: navigationKeyboard(userId),
        }).catch(() => {});
      });
      fs.mkdirSync(path.join(DATA_DIR, 'textpro-tmp'), { recursive: true });
      const buffer = result.buffer;
      const ext = buffer[0] === 0x89 && buffer[1] === 0x50 ? 'png' : 'jpg';
      tempRelative = path.join('data', 'textpro-tmp', `textpro-${process.pid}-${Date.now()}.${ext}`);
      fs.writeFileSync(path.resolve(ROOT, tempRelative), buffer, { mode: 0o600 });
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      await telegramMultipart('sendPhoto', {
        chat_id: chatId,
        caption: safeText(`⚡ ABIX // EFFECT LAB\nSite: ${result.siteLabel || getSiteConfig(template.site || template.url).label}\nTemplate: ${template.title}\nText: ${texts.join(' / ')}\nSource: ${template.url}`, MAX_CAPTION_LENGTH),
        reply_markup: navigationKeyboard(userId),
      }, 'photo', tempRelative, mime);
      try { await telegramApi('deleteMessage', { chat_id: chatId, message_id: loading.message_id }); } catch {}
    } catch (error) {
      console.warn(`[Telegram TextPro] Generation failed: ${safeText(error.message, 220)}`);
      try {
        await telegramApi('editMessageText', {
          chat_id: chatId, message_id: loading.message_id,
          text: `⚠️ Effect generation failed\n${safeText(error.message, 250)}\n\nTry the related site's popular list or open the effect page directly.`,
          reply_markup: navigationKeyboard(userId),
        });
      } catch {
        await sendMessage(chatId, `⚠️ Effect generation failed: ${safeText(error.message, 200)}`, navigationKeyboard(userId)).catch(() => {});
      }
    } finally {
      if (tempRelative) try { fs.unlinkSync(path.resolve(ROOT, tempRelative)); } catch {}
    }
  })().catch(error => console.warn(`[Telegram TextPro] Job rejected: ${error.message}`));
  return loading;
}

async function directTextProCommand(chatId, message, userId, command, textArg) {
  const activeSession = getSession(chatId, userId);
  activeSession.mode = null;
  activeSession.textProTemplate = null;

  const siteMain = { ephoto: 'ephoto', birthdaycake: 'birthdaycake' };
  if (siteMain[command]) {
    const siteKey = siteMain[command];
    if (!textArg) return showSiteFxMenu(chatId, message, userId, siteKey);
    const request = parseTextProRequest(textArg);
    const template = resolveTemplate(request?.target);
    if (!template || resolveSiteKey(template.site || template.url) !== siteKey) {
      return sendMessage(chatId, `❌ Template not found for ${getSiteConfig(siteKey).label}. Use /${getSiteConfig(siteKey).popularCommand}, /${getSiteConfig(siteKey).searchCommand}, or a matching template command.`, navigationKeyboard(userId));
    }
    if (!request.text) return promptTextPro(chatId, message, userId, template);
    return beginTextProGeneration(chatId, userId, template, request.text);
  }

  const siteAction = {
    epopular: ['ephoto', 'popular'], epnew: ['ephoto', 'new'], epsearch: ['ephoto', 'search'], epcategories: ['ephoto', 'categories'],
    bcpopular: ['birthdaycake', 'popular'], bcnew: ['birthdaycake', 'new'], bcsearch: ['birthdaycake', 'search'], bccategories: ['birthdaycake', 'categories'],
  }[command];
  if (siteAction) {
    const [siteKey, action] = siteAction;
    const site = getSiteConfig(siteKey);
    if (action === 'popular') return showSiteFxList(chatId, message, userId, siteKey, 'popular', getSiteTemplates(siteKey, 'popular'), 0);
    if (action === 'new') return loadAndShowSiteFxList(chatId, message, userId, siteKey, 'new');
    if (action === 'categories') return showSiteCategories(chatId, message, userId, siteKey);
    if (action === 'search') {
      if (!textArg) {
        activeSession.mode = `sitefx-search:${siteKey}`;
        return sendMessage(chatId, `${themeHeader(userId, `${site.shortLabel.toUpperCase()} SEARCH`)}\n\nSend a keyword such as neon, birthday, cake, or name.`, navigationKeyboard(userId, [[button('Cancel', `sfx:menu:${siteKey}`)]]));
      }
      return loadAndShowSiteFxList(chatId, message, userId, siteKey, 'search', textArg);
    }
  }

  if (command === 'textpro') {
    if (!textArg) return showTextProMenu(chatId, null, userId);
    const request = parseTextProRequest(textArg);
    const template = resolveTemplate(request?.target);
    if (!template) return sendMessage(chatId, '❌ Template not found. Use /tppopular, /epopular, /bcpopular, a site search command, or /textpro <template-key> | <text>.', navigationKeyboard(userId));
    if (!request.text) return promptTextPro(chatId, null, userId, template);
    return beginTextProGeneration(chatId, userId, template, request.text);
  }
  if (command === 'tppopular') {
    const session = getSession(chatId, userId);
    session.mode = null;
    return showTextProList(chatId, message, userId, 'popular', POPULAR_TEMPLATES, 0);
  }
  if (command === 'tpnew') {
    return loadAndShowTextProList(chatId, message, userId, 'new');
  }
  if (command === 'tpsearch') {
    if (!textArg) {
      getSession(chatId, userId).mode = 'textpro-search';
      return sendMessage(chatId, `${themeHeader(userId, 'TEXTPRO SEARCH')}\n\nSend a keyword (neon, gold, matrix, candy, chrome).`, navigationKeyboard(userId, [[button('Cancel', 'tp:menu')]]));
    }
    return loadAndShowTextProList(chatId, message, userId, 'search', textArg);
  }
  if (command === 'tpcategories') {
    return sendMessage(chatId,
      `${themeHeader(userId, 'TEXTPRO CATEGORIES')}\n\nLight Style\nMetallic Style\nMisc Style\nFood Style\nDeluxe Text Effect\n3D Text Effect\nTech Style\nGraffiti Style\nChristmas\nHappy New Year\n\nUse /tpsearch <keyword> to find specific effects.`,
      navigationKeyboard(userId, [[button('🔥 Popular', 'tp:popular'), button('🆕 Latest', 'tp:new')]]));
  }
  const template = TEXTPRO_COMMANDS.get(command);
  if (!template) return null;
  if (!textArg) return promptTextPro(chatId, null, userId, template);
  return beginTextProGeneration(chatId, userId, template, textArg);
}

const MAX_SOUNDCLOUD_ITEMS = 5;

const SOUNDCLOUD_COMMAND_MODES = Object.freeze({
  scmusic: 'help', schelp: 'help', scsearch: 'search', scdownload: 'auto',
  scplaylist: 'playlist', scuser: 'user', sclikes: 'likes',
});

function soundCloudInputAndLimit(args, mode) {
  const tokens = Array.isArray(args) ? args.map(String) : [];
  let limit = MAX_SOUNDCLOUD_ITEMS;
  if (mode !== 'search' && tokens.length > 1 && /^\d+$/.test(tokens[tokens.length - 1])) {
    limit = Math.max(1, Math.min(limit, Number.parseInt(tokens.pop(), 10) || limit));
  }
  return { input: tokens.join(' ').trim(), limit };
}

function soundCloudResultText(userId, query, result) {
  const tracks = result.tracks || [];
  const body = tracks.map((track, index) => {
    const available = track.downloadable ? '✅ Creator download enabled' : '🔒 No creator download';
    return `${index + 1}. ${safeText(track.title || 'Untitled', 90)}\n   ${safeText(track.artist || 'Unknown artist', 60)} • ${track.duration || '?'}\n   ${available}\n   ${track.url || ''}`;
  }).join('\n\n');
  return `${themeHeader(userId, 'SOUNDCLOUD SEARCH')}\n\nQuery: ${safeText(query, 100)}\nResults: ${tracks.length}\n\n${body}\n\nUse /scdownload <track URL> to download an official creator-enabled file.`;
}

async function handleTelegramSoundCloud(chatId, message, userId, command, args) {
  const mode = SOUNDCLOUD_COMMAND_MODES[command] || 'help';
  const { input, limit } = soundCloudInputAndLimit(args, mode);
  const usage = `${themeHeader(userId, 'SOUNDCLOUD TOOLS')}\n\n/scsearch <song or artist>\n/scdownload <track, playlist, or profile URL>\n/scplaylist <playlist URL> [limit]\n/scuser <profile URL> [limit]\n/sclikes <profile URL> [limit]\n\nMax ${MAX_SOUNDCLOUD_ITEMS} tracks per request. Only public official creator-enabled downloads are supported; no SoundCloud credentials are required.`;
  if (mode === 'help' || !input) return sendMessage(chatId, usage, navigationKeyboard(userId));
  if (mode === 'search' && /^https?:\/\//i.test(input)) return sendMessage(chatId, 'Use /scdownload <SoundCloud URL> to process a track, playlist, or profile.', navigationKeyboard(userId));
  if (mode !== 'search' && !/^https?:\/\//i.test(input)) return sendMessage(chatId, usage, navigationKeyboard(userId));

  const status = await sendMessage(chatId, `${themeHeader(userId, 'SOUNDCLOUD')}\n\n${mode === 'search' ? '🔎 Searching SoundCloud...' : '🎧 Checking track and playlist download availability...'}`);
  const tempDir = path.join(os.tmpdir(), 'abix-soundcloud-telegram', `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`);
  try {
    const auth = await soundcloudService.getAuth();
    const collected = await soundcloudService.collectTracks(auth, { mode, input, query: input, limit });
    const tracks = (collected.tracks || []).slice(0, limit);
    if (!tracks.length) return editScreen(chatId, status, userId, `${themeHeader(userId, 'NO RESULTS')}\n\nNo matching tracks were found.`, navigationKeyboard(userId));

    if (mode === 'search') {
      return editScreen(chatId, status, userId, soundCloudResultText(userId, input, { ...collected, tracks }).slice(0, MAX_MESSAGE_LENGTH), navigationKeyboard(userId));
    }

    await fs.promises.mkdir(tempDir, { recursive: true });
    const result = await soundcloudService.downloadTracks(auth, tracks, tempDir);
    if (!result.files.length) {
      const eligible = tracks.some(track => track.downloadable);
      const reason = eligible
        ? 'SoundCloud did not provide an unauthenticated official download for these tracks. No login or stream-ripping fallback is used.'
        : 'These tracks do not have the creator-enabled download option. Playback streams are not extracted.';
      return editScreen(chatId, status, userId, `${themeHeader(userId, 'NO DOWNLOADS')}\n\n${reason}\n\nTracks checked: ${tracks.length}\nSkipped: ${result.skipped}`, navigationKeyboard(userId));
    }

    const telegramMax = Math.max(1024 * 1024, Number(process.env.TELEGRAM_MEDIA_MAX_BYTES) || 20 * 1024 * 1024);
    const eligibleFiles = result.files.filter(item => item.size <= telegramMax);
    const oversize = result.files.length - eligibleFiles.length;
    await editScreen(chatId, status, userId, `${themeHeader(userId, 'SOUNDCLOUD DOWNLOAD')}\n\nDownloaded ${result.files.length} official file(s). Sending ${eligibleFiles.length} to Telegram...`, navigationKeyboard(userId));

    let sent = 0;
    for (const item of eligibleFiles) {
      const track = item.track || {};
      const caption = `${safeText(track.title || 'SoundCloud track', 180)}\nArtist: ${safeText(track.artist || 'Unknown', 100)}\nSource: ${track.url || 'SoundCloud'}`;
      await telegramMultipart('sendAudio', {
        chat_id: chatId,
        title: safeText(track.title || 'SoundCloud track', 64),
        performer: safeText(track.artist || 'SoundCloud', 64),
        caption: safeText(caption, MAX_CAPTION_LENGTH),
      }, 'audio', item.path, item.contentType || 'audio/mpeg');
      sent++;
    }
    const summary = `${themeHeader(userId, 'SOUNDCLOUD COMPLETE')}\n\n✅ Sent ${sent} track(s).\n${result.skipped} track(s) skipped by SoundCloud's official-download rules.${oversize ? `\n${oversize} track(s) exceeded TELEGRAM_MEDIA_MAX_BYTES and were not sent.` : ''}`;
    return editScreen(chatId, status, userId, summary, navigationKeyboard(userId));
  } catch (error) {
    return editScreen(chatId, status, userId, `${themeHeader(userId, 'SOUNDCLOUD ERROR')}\n\n${safeText(error.message, 750)}`, navigationKeyboard(userId));
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleCommand(chatId, message, userId, command, args) {
  const textArg = args.join(' ').trim();
  const chatType = message.chat?.type;
  const session = getSession(chatId, userId);

  if (isBlockedAdultRequest(command, textArg)) {
    return sendMessage(chatId, '🚫 Adult commands and sources are disabled for everyone.', navigationKeyboard(userId));
  }

  if (Object.prototype.hasOwnProperty.call(SOUNDCLOUD_COMMAND_MODES, command)) {
    return handleTelegramSoundCloud(chatId, message, userId, command, args);
  }

  if (['textpro', 'tppopular', 'tpnew', 'tpsearch', 'tpcategories', 'ephoto', 'birthdaycake', 'epopular', 'epnew', 'epsearch', 'epcategories', 'bcpopular', 'bcnew', 'bcsearch', 'bccategories'].includes(command) || TEXTPRO_COMMANDS.has(command)) {
    return directTextProCommand(chatId, null, userId, command, textArg);
  }

  if (['id', 'myid'].includes(command)) return sendMessage(chatId, formatChatIds(message, 'all'), navigationKeyboard(userId));
  if (command === 'userid' || command === 'user_id') return sendMessage(chatId, formatChatIds(message, 'user'), navigationKeyboard(userId));
  if (command === 'chatid' || command === 'chat_id') return sendMessage(chatId, formatChatIds(message, 'chat'), navigationKeyboard(userId));
  if (command === 'groupid' || command === 'group_id') return sendMessage(chatId, formatChatIds(message, 'group'), navigationKeyboard(userId));
  if (command === 'channelid' || command === 'channel_id') return sendMessage(chatId, formatChatIds(message, 'channel'), navigationKeyboard(userId));

  switch (command) {
    case 'start': {
      session.mode = null;
      const startParam = String(args[0] || 'home').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64);
      const destinations = {
        home: () => startAnimation(chatId, userId),
        menu: () => startAnimation(chatId, userId),
        ai: () => sendMessage(chatId, pageContent(userId, 'ai', chatId), pageKeyboard(userId, 'ai', chatId)),
        media: () => sendMessage(chatId, pageContent(userId, 'media', chatId), pageKeyboard(userId, 'media', chatId)),
        tools: () => sendMessage(chatId, pageContent(userId, 'tools', chatId), pageKeyboard(userId, 'tools', chatId)),
        progress: () => sendMessage(chatId, pageContent(userId, 'tools', chatId), pageKeyboard(userId, 'tools', chatId)),
        search: () => startSearch(chatId, null, userId, ''),
        ids: () => sendMessage(chatId, formatChatIds(message, 'all'), pageKeyboard(userId, 'ids', chatId)),
        settings: () => sendMessage(chatId, pageContent(userId, 'settings', chatId, chatType), pageKeyboard(userId, 'settings', chatId, chatType)),
        textpro: () => showTextProMenu(chatId, null, userId),
        ephoto: () => showSiteFxMenu(chatId, null, userId, 'ephoto'),
        birthdaycake: () => showSiteFxMenu(chatId, null, userId, 'birthdaycake'),
        album: () => sendMediaAlbum(chatId, userId),
        help: () => sendMessage(chatId, pageContent(userId, 'help'), pageKeyboard(userId, 'help')),
      };
      return (destinations[startParam] || destinations.home)();
    }
    case 'menu':
      session.mode = null;
      return sendHome(chatId, userId, true);
    case 'more':
      return sendMessage(chatId, pageContent(userId, 'more'), pageKeyboard(userId, 'more', chatId));
    case 'help':
    case 'commands':
      return sendMessage(chatId, pageContent(userId, 'help'), pageKeyboard(userId, 'help'));
    case 'settings':
      return sendMessage(chatId, pageContent(userId, 'settings', chatId, chatType), pageKeyboard(userId, 'settings', chatId, chatType));
    case 'status':
      if (chatType !== 'private' || !isAdmin(userId)) {
        return sendMessage(chatId, '✅ ABIX is responding. Detailed runtime diagnostics are available to configured Telegram admins through /status in a private chat.');
      }
      return sendMessage(chatId, formatRuntimeStatus(userId), navigationKeyboard(userId));
    case 'ping':
      return sendMessage(chatId, `🏓 PONG\nTelegram API update received.\nProcess uptime: ${Math.floor(process.uptime())} seconds`, navigationKeyboard(userId));
    case 'admin':
      return showAdmin(chatId, message, userId);
    case 'ask':
      if (chatType !== 'private') return sendMessage(chatId, 'For privacy, open a private chat with the bot before using /ask.');
      session.mode = textArg ? null : 'ai';
      if (textArg) return sendGeminiPrompt(chatId, userId, textArg);
      return sendMessage(chatId, `${themeHeader(userId, 'NEURAL ENGINE')}\n\nSend the prompt you want Gemini to answer.`, navigationKeyboard(userId, [[button('Cancel', 'menu:ai')]]));
    case 'search':
      return startSearch(chatId, null, userId, textArg);
    case 'keyboard':
    case 'replykeyboard':
      return sendMessage(chatId, 'Quick actions are ready. You can still use inline buttons in any menu.', getReplyKeyboard());
    case 'hidekeyboard':
      return sendMessage(chatId, 'Reply keyboard hidden.', { remove_keyboard: true });
    case 'album':
      return sendMediaAlbum(chatId, userId);
    case 'inline':
      return sendMessage(chatId,
        `${themeHeader(userId, 'INLINE MODE')}\n\nEnable Inline Mode for this bot with @BotFather. Then type @${state.username || 'YourBot'} followed by a search term in any chat.\n\nExample: @${state.username || 'YourBot'} media`,
        navigationKeyboard(userId));
    case 'links':
      return sendQuickLinks(chatId, userId);
    case 'app':
      return sendMiniApp(chatId, userId, chatType);
    default:
      return sendMessage(chatId, 'Unknown command. Use /menu or /help.');
  }
}

async function handleMessage(message) {
  if (!message?.chat || !message?.from) return;
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = typeof message.text === 'string' ? message.text.trim() : '';

  // Reply-keyboard shortcuts route to the same tested command handlers.
  const shortcuts = {
    '🏠 Menu': ['menu', []],
    '🔎 Search': ['search', []],
    '🆔 My ID': ['id', []],
    '🎬 Media': ['menu', []],
    '⚙️ Settings': ['settings', []],
    '❓ Help': ['help', []],
  };
  if (text && shortcuts[text]) {
    const [command, args] = shortcuts[text];
    if (text === '🎬 Media') return sendMessage(chatId, pageContent(userId, 'media', chatId), pageKeyboard(userId, 'media', chatId));
    return handleCommand(chatId, message, userId, command, args);
  }

  const commandMatch = text.match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (commandMatch) {
    return handleCommand(chatId, message, userId, commandMatch[1].toLowerCase(), (commandMatch[2] || '').trim().split(/\s+/).filter(Boolean));
  }

  if (await moderateLinkMessage(message)) return;
  if (!text) return;

  const activeSession = getSession(chatId, userId);
  if (activeSession.mode === 'textpro-search') {
    activeSession.mode = null;
    return loadAndShowTextProList(chatId, null, userId, 'search', safeText(text, 100));
  }
  if (typeof activeSession.mode === 'string' && activeSession.mode.startsWith('sitefx-search:')) {
    const siteKey = activeSession.mode.slice('sitefx-search:'.length);
    activeSession.mode = null;
    if (!['ephoto', 'birthdaycake'].includes(siteKey)) return sendMessage(chatId, 'Search session expired. Use /ephoto or /birthdaycake.');
    return loadAndShowSiteFxList(chatId, null, userId, siteKey, 'search', safeText(text, 100));
  }
  if (activeSession.mode === 'textpro-generate') {
    const template = activeSession.textProTemplate;
    activeSession.mode = null;
    activeSession.textProTemplate = null;
    if (!template) return sendMessage(chatId, 'TextPro session expired. Use /textpro to start again.', navigationKeyboard(userId));
    return beginTextProGeneration(chatId, userId, template, text);
  }
  if (activeSession.mode === 'search') {
    activeSession.mode = null;
    activeSession.query = safeText(text, 100);
    activeSession.filter = 'all';
    activeSession.sort = 'relevance';
    activeSession.page = 0;
    const results = renderSearchResults(userId, activeSession);
    return sendMessage(chatId, results.text, results.markup);
  }
  if (activeSession.mode === 'ai') {
    activeSession.mode = null;
    return sendGeminiPrompt(chatId, userId, text);
  }
}
async function handleCallback(callback) {
  const userId = callback?.from?.id;
  const message = callback?.message;
  if (!userId || !message?.chat) return answerCallback(callback, 'This button is no longer available.');
  const chatId = message.chat.id;
  const data = String(callback.data || '');
  const session = getSession(chatId, userId);
  if ((data === 'menu:admin' || data.startsWith('admin:') || data === 'feature:admin') && (!isAdmin(userId) || message.chat.type !== 'private')) {
    return answerCallback(callback, 'Admin access denied.', true);
  }
  if (data === 'ai:prompt' && message.chat.type !== 'private') {
    return answerCallback(callback, 'Use AI in a private chat.', true);
  }
  await answerCallback(callback);

  if (data === 'tp:noop') return;
  if (data === 'tp:menu') { session.mode = null; session.textProTemplate = null; return showTextProMenu(chatId, message, userId); }
  if (data === 'tp:popular') { session.mode = null; session.textProTemplate = null; return showTextProList(chatId, message, userId, 'popular', POPULAR_TEMPLATES, 0); }
  if (data === 'tp:new') { session.mode = null; session.textProTemplate = null; return loadAndShowTextProList(chatId, message, userId, 'new'); }
  if (data === 'tp:search') {
    session.mode = 'textpro-search';
    session.textProTemplate = null;
    return editScreen(chatId, message, userId,
      `${themeHeader(userId, 'TEXTPRO SEARCH')}\n\nSend a keyword such as neon, gold, matrix, candy, or chrome.`,
      navigationKeyboard(userId, [[button('Cancel', 'tp:menu')]]));
  }
  const pageMatch = data.match(/^tp:page:(popular|new|search):(\d+)$/);
  if (pageMatch) {
    const mode = pageMatch[1];
    const requestedPage = Number(pageMatch[2]);
    const items = session.textProListMode === mode && Array.isArray(session.textProItems)
      ? session.textProItems
      : mode === 'popular' ? POPULAR_TEMPLATES : mode === 'new' ? NEW_TEMPLATES : [];
    return showTextProList(chatId, message, userId, mode, items, requestedPage);
  }
  const useMatch = data.match(/^tp:use:(popular|new|search):(\d+)$/);
  if (useMatch) {
    const mode = useMatch[1];
    const index = Number(useMatch[2]);
    const items = session.textProListMode === mode && Array.isArray(session.textProItems)
      ? session.textProItems
      : mode === 'popular' ? POPULAR_TEMPLATES : mode === 'new' ? NEW_TEMPLATES : [];
    const template = items[index];
    if (!template) return sendMessage(chatId, 'That template selection expired. Open /textpro and try again.', navigationKeyboard(userId));
    session.mode = null;
    return promptTextPro(chatId, message, userId, template);
  }

  if (data === 'sfx:noop') return;
  const siteMenuMatch = data.match(/^sfx:(menu|popular|new|search|categories):(ephoto|birthdaycake)$/);
  if (siteMenuMatch) {
    const [, action, siteKey] = siteMenuMatch;
    if (action === 'menu') return showSiteFxMenu(chatId, message, userId, siteKey);
    if (action === 'popular') return showSiteFxList(chatId, message, userId, siteKey, 'popular', getSiteTemplates(siteKey, 'popular'), 0);
    if (action === 'new') return loadAndShowSiteFxList(chatId, message, userId, siteKey, 'new');
    if (action === 'categories') return showSiteCategories(chatId, message, userId, siteKey);
    session.mode = `sitefx-search:${siteKey}`;
    return editScreen(chatId, message, userId,
      `${themeHeader(userId, `${getSiteConfig(siteKey).shortLabel.toUpperCase()} SEARCH`)}\n\nSend a keyword such as neon, birthday, cake, or name.`,
      navigationKeyboard(userId, [[button('Cancel', `sfx:menu:${siteKey}`)]]));
  }
  const sitePageMatch = data.match(/^sfx:page:(ephoto|birthdaycake):(popular|new|search):(\d+)$/);
  if (sitePageMatch) {
    const [, siteKey, mode, page] = sitePageMatch;
    const items = session.effectSiteKey === siteKey && session.effectSiteMode === mode && Array.isArray(session.effectSiteItems)
      ? session.effectSiteItems
      : mode === 'search' ? [] : getSiteTemplates(siteKey, mode);
    return showSiteFxList(chatId, message, userId, siteKey, mode, items, Number(page));
  }
  const siteUseMatch = data.match(/^sfx:use:(ephoto|birthdaycake):(popular|new|search):(\d+)$/);
  if (siteUseMatch) {
    const [, siteKey, mode, rawIndex] = siteUseMatch;
    const index = Number(rawIndex);
    const items = session.effectSiteKey === siteKey && session.effectSiteMode === mode && Array.isArray(session.effectSiteItems)
      ? session.effectSiteItems
      : mode === 'search' ? [] : getSiteTemplates(siteKey, mode);
    const template = items[index];
    if (!template) return sendMessage(chatId, 'That effect selection expired. Open the site menu and try again.', navigationKeyboard(userId));
    session.mode = null;
    return promptTextPro(chatId, message, userId, template);
  }

  if (data === 'menu:ids') {
    const info = formatChatIds({ chat: message.chat, from: callback.from }, 'all');
    return editScreen(chatId, message, userId, info, pageKeyboard(userId, 'ids', chatId));
  }
  if (data === 'menu:links') return sendQuickLinks(chatId, userId);
  if (data === 'ui:replykeyboard') return sendMessage(chatId, 'Quick actions are ready. You can still use inline buttons in any menu.', getReplyKeyboard());
  if (data === 'ui:app') return sendMiniApp(chatId, userId, message.chat.type);
  if (data === 'ui:inline') return sendMessage(chatId, `Enable Inline Mode with @BotFather, then type @${state.username || 'YourBot'} plus a keyword in any chat.`, navigationKeyboard(userId));
  if (data === 'menu:home') {
    session.mode = null;
    session.previousScreen = session.currentScreen && session.currentScreen !== 'home' ? session.currentScreen : null;
    session.currentScreen = 'home';
    return editScreen(chatId, message, userId, homeText(userId), homeKeyboard(userId));
  }
  if (data === 'nav:back') {
    session.mode = null;
    const destination = session.previousScreen || 'home';
    session.previousScreen = destination === 'home' ? null : 'home';
    session.currentScreen = destination;
    if (destination === 'home') return editScreen(chatId, message, userId, homeText(userId), homeKeyboard(userId));
    return editScreen(chatId, message, userId, pageContent(userId, destination, chatId, message.chat.type), pageKeyboard(userId, destination, chatId, message.chat.type));
  }
  if (data.startsWith('menu:')) {
    const key = data.slice(5);
    if (!['ai', 'media', 'search', 'settings', 'tools', 'help', 'admin', 'ids', 'links', 'more'].includes(key)) return;
    if (key === 'admin' && (!isAdmin(userId) || message.chat.type !== 'private')) return sendMessage(chatId, '⛔ Admin dashboard is restricted to configured Telegram admins in private chats.');
    if (key === 'search') {
      session.mode = null;
      session.query = '';
      session.filter = 'all';
      session.sort = 'relevance';
      session.page = 0;
    }
    if (key === 'links') return sendQuickLinks(chatId, userId);
    if (key === 'ids') {
      const info = formatChatIds({ chat: message.chat, from: callback.from }, 'all');
      return editScreen(chatId, message, userId, info, pageKeyboard(userId, 'ids', chatId));
    }
    return showPage(chatId, message, userId, key);
  }
  if (data.startsWith('id:')) {
    const requested = data.slice(3);
    if (!['all', 'user', 'chat', 'group', 'channel'].includes(requested)) return;
    return sendMessage(chatId, formatChatIds({ chat: message.chat, from: callback.from }, requested), navigationKeyboard(userId));
  }
  if (data === 'settings:toggle:image') {
    const preference = getPreference(userId);
    preference.menuImage = !preference.menuImage;
    savePreferences();
    return editScreen(chatId, message, userId, pageContent(userId, 'settings', chatId, message.chat.type), pageKeyboard(userId, 'settings', chatId, message.chat.type));
  }
  if (data === 'settings:toggle:layout') {
    const preference = getPreference(userId);
    preference.layout = preference.layout === 'list' ? 'grid' : 'list';
    savePreferences();
    return editScreen(chatId, message, userId, pageContent(userId, 'settings', chatId, message.chat.type), pageKeyboard(userId, 'settings', chatId, message.chat.type));
  }
  if (data === 'chatsettings:antilink') {
    if (!isGroupChat(message.chat)) return sendMessage(chatId, 'Anti-Link can only be managed inside a group or supergroup.');
    if (!await isChatAdministrator(chatId, userId)) return sendMessage(chatId, '⛔ Only group administrators can change Anti-Link.');
    const current = getChatSettings(chatId);
    if (!current.antiLink && !await botCanDeleteMessages(chatId)) return sendMessage(chatId, '⚠️ Promote the bot to administrator with Delete Messages permission first. Anti-Link was not enabled.');
    current.antiLink = !current.antiLink;
    saveChatSettings();
    return editScreen(chatId, message, userId, pageContent(userId, 'settings', chatId, message.chat.type), pageKeyboard(userId, 'settings', chatId, message.chat.type));
  }
  if (data === 'media:album') {
    void sendMediaAlbum(chatId, userId).catch(error => sendMessage(chatId, `⚠️ Album failed: ${safeText(error.message, 180)}`, navigationKeyboard(userId)));
    return;
  }
  if (data.startsWith('theme:')) {
    const theme = data.slice(6);
    if (!THEMES[theme]) return;
    getPreference(userId).theme = theme;
    savePreferences();
    return editScreen(chatId, message, userId, pageContent(userId, 'settings', chatId, message.chat.type), pageKeyboard(userId, 'settings', chatId, message.chat.type));
  }
  if (data === 'ai:prompt') {
    session.mode = 'ai';
    return editScreen(chatId, message, userId, `${themeHeader(userId, 'NEURAL ENGINE')}\n\nSend your prompt in this private chat.`, navigationKeyboard(userId, [[button('Cancel', 'menu:ai')]]));
  }
  if (data === 'ai:clear') {
    aiHistory.delete(String(userId));
    return editScreen(chatId, message, userId, `${themeHeader(userId, 'AI ENGINE')}\n\nConversation history cleared for this in-memory session.`, pageKeyboard(userId, 'ai'));
  }
  if (data === 'media:image') return sendMediaCard(chatId, userId, 'image');
  if (data === 'media:video') return sendMediaCard(chatId, userId, 'video');
  if (data === 'job:demo') {
    void progressDemo(chatId, userId).catch(error => console.warn(`[Telegram] Progress demo failed: ${error.message}`));
    return;
  }
  if (data === 'search:new') {
    session.mode = 'search';
    return editScreen(chatId, message, userId, `${themeHeader(userId, 'SEARCH INPUT')}\n\nSend a search term in this chat.`, navigationKeyboard(userId, [[button('Cancel', 'menu:search')]]));
  }
  if (data.startsWith('search:filter:')) {
    const filter = data.slice('search:filter:'.length);
    if (!['all', 'media', 'tools', 'admin'].includes(filter) || (filter === 'admin' && !isAdmin(userId))) return;
    session.filter = filter;
    session.page = 0;
    const result = renderSearchResults(userId, session);
    return editScreen(chatId, message, userId, result.text, result.markup);
  }
  if (data === 'search:sort:az') {
    session.sort = session.sort === 'az' ? 'relevance' : 'az';
    session.page = 0;
    const result = renderSearchResults(userId, session);
    return editScreen(chatId, message, userId, result.text, result.markup);
  }
  if (data === 'search:noop') return;
  if (data.startsWith('search:page:')) {
    const requested = Number(data.slice('search:page:'.length));
    if (!Number.isInteger(requested) || requested < 0) return;
    session.page = requested;
    const result = renderSearchResults(userId, session);
    return editScreen(chatId, message, userId, result.text, result.markup);
  }
  if (data.startsWith('feature:')) {
    const feature = FEATURES.find(item => item.id === data.slice(8) && featureVisible(item, userId));
    if (!feature) return sendMessage(chatId, 'This feature is no longer available. Open /menu to refresh the interface.');
    if (feature.id === 'ai') return showPage(chatId, message, userId, 'ai');
    if (feature.id === 'image') return sendMediaCard(chatId, userId, 'image');
    if (feature.id === 'video') return sendMediaCard(chatId, userId, 'video');
    if (feature.id === 'textpro') return showTextProMenu(chatId, message, userId);
    if (feature.id === 'search') return showPage(chatId, message, userId, 'search');
    if (feature.id === 'progress') {
      void progressDemo(chatId, userId).catch(error => console.warn(`[Telegram] Progress demo failed: ${error.message}`));
      return;
    }
    if (feature.id === 'settings' || feature.id === 'help') return showPage(chatId, message, userId, feature.id);
    if (feature.id === 'admin') return showAdmin(chatId, message, userId);
  }
  if (data.startsWith('admin:')) {
    if (!isAdmin(userId) || message.chat.type !== 'private') return sendMessage(chatId, '⛔ Admin access denied.');
    if (data === 'admin:refresh') return showAdmin(chatId, message, userId);
    if (data === 'admin:commands') {
      let inventory = [];
      try { inventory = commandProvider?.getCommandInventory?.() || []; } catch {}
      return editScreen(chatId, message, userId, `${themeHeader(userId, 'COMMAND REGISTRY')}\n\nRegistered WhatsApp plugin commands: ${inventory.length}\n\nThey remain WhatsApp-specific unless individually ported to Telegram.`, navigationKeyboard(userId, [[button('🔄 Refresh', 'admin:refresh')]]));
    }
  }
}

async function handleChatJoinRequest(joinRequest) {
  const chatId = joinRequest?.chat?.id;
  const userId = joinRequest?.from?.id;
  if (chatId === undefined || chatId === null || userId === undefined || userId === null) return;
  if (!shouldAutoApproveJoinRequest(chatId)) return;

  try {
    await telegramApi('approveChatJoinRequest', { chat_id: chatId, user_id: userId });
    console.log(`[Telegram] Auto-approved join request for user ${userId} in chat ${chatId}.`);
  } catch (error) {
    console.error(`[Telegram] Could not auto-approve join request in chat ${chatId} for user ${userId}: ${safeText(error.message, 220)}`);
  }
}

async function handleInlineQuery(query) {
  if (!query?.id) return;
  const term = String(query.query || '').trim().toLowerCase();
  const features = FEATURES.filter(item => featureVisible(item, query.from?.id));
  const found = (term ? features.filter(item => `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(term)) : features).slice(0, 20);
  const results = found.map(item => {
    const startKey = item.id === 'textpro' ? 'textpro' : item.id === 'image' || item.id === 'video' ? 'media' : item.id === 'admin' ? 'home' : item.id;
    const result = {
      type: 'article',
      id: `abix-${item.id}`,
      title: item.title,
      description: item.description.slice(0, 200),
      input_message_content: {
        message_text: `⚡ ABIX // ${item.title}\n\n${item.description}\n\nOpen the bot to continue.`,
      },
    };
    if (state.username) result.reply_markup = inlineKeyboard([[urlButton('Open ABIX', `https://t.me/${state.username}?start=${startKey}`)]]);
    return result;
  });
  if (!results.length) {
    results.push({
      type: 'article', id: 'abix-open', title: 'Open ABIX Bot', description: 'Open the main menu and browse tools.',
      input_message_content: { message_text: '⚡ ABIX // Open the bot to browse tools.' },
      ...(state.username ? { reply_markup: inlineKeyboard([[urlButton('Open ABIX', `https://t.me/${state.username}?start=home`)]]) } : {}),
    });
  }
  try {
    await telegramApi('answerInlineQuery', { inline_query_id: query.id, results, cache_time: 10, is_personal: true });
  } catch (error) {
    console.warn(`[Telegram] Inline query failed: ${safeText(error.message, 180)}`);
  }
}

async function handleChannelPost(message) {
  if (!message?.chat || !isChannelChat(message.chat)) return;
  const text = String(message.text || message.caption || '').trim();
  const match = text.match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return;
  const command = match[1].toLowerCase();
  if (!['id', 'chatid', 'channelid', 'channel_id'].includes(command)) return;
  return sendMessage(message.chat.id, formatChatIds(message, command === 'channelid' || command === 'channel_id' ? 'channel' : command === 'chatid' ? 'chat' : 'all'));
}

async function handleUpdate(update) {
  try {
    if (update.chat_join_request) return await handleChatJoinRequest(update.chat_join_request);
    if (update.message) return await handleMessage(update.message);
    if (update.channel_post) return await handleChannelPost(update.channel_post);
    if (update.inline_query) return await handleInlineQuery(update.inline_query);
    if (update.callback_query) return await handleCallback(update.callback_query);
  } catch (error) {
    console.error(`[Telegram] Update handler error: ${safeText(error.message, 220)}`);
    if (update.callback_query) await answerCallback(update.callback_query, 'Action failed. Please try again.');
    else if (update.message?.chat?.id) {
      try { await sendMessage(update.message.chat.id, '⚠️ The request failed. Please try again or use /help.'); } catch {}
    }
  }
}

function buildCommandMenu() {
  const coreCommands = [
    ['start', 'Open the main menu'], ['menu', 'Open the main menu'], ['help', 'Show help'],
    ['ping', 'Check whether the bot responds'], ['status', 'Show dual-transport status'], ['more', 'More UI options'],
    ['id', 'Find user, chat, group, or channel IDs'], ['myid', 'Show your Telegram ID'], ['userid', 'Show a Telegram user ID'],
    ['chatid', 'Show the current chat ID'], ['groupid', 'Show the current group ID'],
    ['channelid', 'Show the current channel ID'],
    ['scmusic', 'Show SoundCloud commands'],
    ['scsearch', 'Search SoundCloud tracks'], ['scdownload', 'Download a track, playlist, or profile'],
    ['scplaylist', 'Download creator-enabled tracks from a playlist'], ['scuser', 'Download creator-enabled user tracks'],
    ['sclikes', 'Download creator-enabled liked tracks'], ['keyboard', 'Show quick reply buttons'],
    ['hidekeyboard', 'Hide quick reply buttons'], ['album', 'Send a media album'],
    ['inline', 'How to use inline search'], ['links', 'Open direct bot links'],
    ['app', 'Launch the optional Mini App'], ['ask', 'Ask the configured Gemini AI'],
    ['search', 'Search Telegram UI features'], ['settings', 'Change theme and group settings'],
    ['admin', 'Open the restricted admin dashboard'], ['textpro', 'Open TextPro effects'],
    ['tppopular', 'Popular TextPro templates'], ['tpnew', 'Latest TextPro templates'],
    ['tpsearch', 'Search TextPro templates'], ['tpcategories', 'TextPro categories'],
    ['ephoto', 'Open Ephoto360 effects'], ['epopular', 'Popular Ephoto360 effects'],
    ['epnew', 'Latest Ephoto360 effects'], ['epsearch', 'Search Ephoto360 effects'],
    ['epcategories', 'Ephoto360 categories'], ['birthdaycake', 'Open BirthdayCake24 effects'],
    ['bcpopular', 'Popular BirthdayCake24 effects'], ['bcnew', 'Latest BirthdayCake24 effects'],
    ['bcsearch', 'Search BirthdayCake24 effects'], ['bccategories', 'BirthdayCake24 categories'],
  ].map(([command, description]) => ({ command, description }));
  const seen = new Set();
  // Keep the Telegram command dropdown short. Every individual template command
  // remains registered in handleCommand, but template commands are discovered
  // through each site's searchable inline-button menu rather than flooding the menu.
  return coreCommands
    .filter(item => /^[a-z0-9_]{1,32}$/.test(item.command) && !seen.has(item.command) && seen.add(item.command))
    .slice(0, 100)
    .map(item => ({ command: item.command, description: safeText(item.description, 256) }));
}

function parsePollTimeout() {
  const parsed = Number.parseInt(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS || '', 10);
  return Math.min(50, Math.max(0, Number.isFinite(parsed) ? parsed : DEFAULT_POLL_TIMEOUT_SECONDS));
}

async function pollLoop() {
  while (!stopRequested) {
    const controller = new AbortController();
    currentPollController = controller;
    const timeoutSeconds = parsePollTimeout();
    const timer = setTimeout(() => controller.abort(), (timeoutSeconds + 12) * 1000);
    try {
      const updates = await telegramApi('getUpdates', {
        offset: updateOffset,
        timeout: timeoutSeconds,
        allowed_updates: getAllowedUpdates(),
      }, { signal: controller.signal });
      clearTimeout(timer);
      backoffMs = 1000;
      publishState({ status: 'connected', lastError: null });
      for (const update of Array.isArray(updates) ? updates : []) {
        await handleUpdate(update);
        updateOffset = Math.max(updateOffset, Number(update.update_id || 0) + 1);
        saveUpdateOffset();
        if (stopRequested) break;
      }
    } catch (error) {
      clearTimeout(timer);
      if (stopRequested) break;
      if (error.name === 'AbortError') {
        publishState({ status: 'degraded', lastError: 'Telegram long-poll request timed out' });
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        backoffMs = Math.min(30000, backoffMs * 2);
      } else {
        const status = error.telegramErrorCode === 409 ? 'conflict' : 'degraded';
        publishState({ status, lastError: safeText(error.message, 180) });
        console.error(`[Telegram] Polling error (${status}): ${safeText(error.message, 180)}`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        backoffMs = Math.min(30000, backoffMs * 2);
      }
    } finally {
      clearTimeout(timer);
      if (currentPollController === controller) currentPollController = null;
    }
  }
  publishState({ status: 'stopped' });
}

async function startTelegramBot(options = {}) {
  if (startingPromise) return startingPromise;
  telegramToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!telegramToken) {
    publishState({ status: 'disabled', configured: false, username: null, botId: null });
    console.log('[Telegram] Disabled; set TELEGRAM_BOT_TOKEN to enable the Telegram transport. WhatsApp is unchanged.');
    return { enabled: false, reason: 'missing_token' };
  }
  if (pollTask) return { enabled: true, username: state.username };

  startingPromise = (async () => {
    commandProvider = options.commandHandler || commandProvider;
    stopRequested = false;
    publishState({ status: 'connecting', configured: true, lastError: null });
    try {
      const me = await telegramApi('getMe', {}, { timeoutMs: 12000 });
      const currentBotId = String(me?.id || '');
      if (!currentBotId) throw new Error('Telegram getMe returned no bot ID.');
      if (updateOffsetBotId !== currentBotId) {
        updateOffset = 0;
        updateOffsetBotId = currentBotId;
        saveUpdateOffset();
        console.log('[Telegram] Polling offset initialized for this bot identity.');
      }
      // getUpdates cannot run while a webhook is configured. Do not silently
      // delete a webhook that another deployment may rely on.
      const webhook = await telegramApi('getWebhookInfo', {}, { timeoutMs: 12000 });
      if (String(webhook?.url || '').trim()) {
        const error = new Error('A Telegram webhook is configured for this bot token. This transport uses long polling; remove the webhook explicitly before enabling polling.');
        error.telegramErrorCode = 409;
        error.noRetry = true;
        throw error;
      }
      startupBackoffMs = 3000;
      publishState({ status: 'connected', configured: true, username: me.username || null, botId: me.id || null, connectedAt: new Date().toISOString(), lastError: null });
      try {
        await telegramApi('setMyCommands', { commands: buildCommandMenu() });
      } catch (error) {
        console.warn(`[Telegram] Could not register command menu: ${error.message}`);
      }
      console.log(`[Telegram] Connected as @${me.username || me.id}; starting long polling.`);
      console.log(`[Telegram] Join-request auto-approval: ${autoApproveJoinRequestsEnabled() ? 'ENABLED' : 'disabled'}${autoApproveJoinRequestsEnabled() && parseAutoApproveChatIds().size === 0 ? ' (all eligible chats)' : ''}.`);
      publishState({ status: 'connected', configured: true, username: me.username || null, botId: me.id || null });
      pollTask = pollLoop().catch(error => {
        publishState({ status: 'degraded', lastError: safeText(error.message, 180) });
        console.error(`[Telegram] Poller stopped unexpectedly: ${safeText(error.message, 180)}`);
      }).finally(() => { pollTask = null; });
      return { enabled: true, username: me.username || null, id: me.id || null };
    } catch (error) {
      const startupStatus = Number(error.telegramErrorCode || 0) === 409 ? 'conflict' : 'error';
      publishState({ status: startupStatus, configured: true, lastError: safeText(error.message, 180) });
      console.error(`[Telegram] Startup failed: ${safeText(error.message, 180)}. Check TELEGRAM_BOT_TOKEN, webhook configuration, and outbound HTTPS access.`);
      if (!error.noRetry && ![400, 401, 403, 409].includes(Number(error.telegramErrorCode || 0)) && !stopRequested) {
        const retryIn = startupBackoffMs;
        startupBackoffMs = Math.min(60000, startupBackoffMs * 2);
        if (startupRetryTimer) clearTimeout(startupRetryTimer);
        startupRetryTimer = setTimeout(() => {
          startupRetryTimer = null;
          if (!stopRequested && !pollTask) startTelegramBot({ commandHandler }).catch(() => {});
        }, retryIn);
        startupRetryTimer.unref?.();
        console.warn(`[Telegram] Will retry startup in ${Math.round(retryIn / 1000)} seconds.`);
      }
      throw error;
    } finally {
      startingPromise = null;
    }
  })();
  return startingPromise;
}

async function stopTelegramBot() {
  stopRequested = true;
  if (startupRetryTimer) { clearTimeout(startupRetryTimer); startupRetryTimer = null; }
  if (currentPollController) {
    try { currentPollController.abort(); } catch {}
  }
  if (pollTask) {
    let timer;
    try {
      await Promise.race([pollTask, new Promise(resolve => { timer = setTimeout(resolve, 3000); timer.unref?.(); })]);
    } catch {}
    finally { if (timer) clearTimeout(timer); }
  }
  pollTask = null;
  startingPromise = null;
  if (state.configured) publishState({ status: 'stopped' });
}

module.exports = {
  startTelegramBot,
  stopTelegramBot,
  getTelegramStatus,
  // Exported pure helpers support regression tests without a bot token/network.
  internals: {
    THEMES,
    FEATURES,
    button,
    homeKeyboard,
    homeText,
    pageContent,
    pageKeyboard,
    searchKeyboard,
    navigationKeyboard,
    renderSearchResults,
    parseAdminIds,
    splitText,
    autoApproveJoinRequestsEnabled,
    parseAutoApproveChatIds,
    shouldAutoApproveJoinRequest,
    getAllowedUpdates,
    isAdmin,
    formatChatIds,
    isGroupChat,
    isChannelChat,
    hasLink,
    getReplyKeyboard,
    getMiniAppUrl,
    getChatSettings,
    loadChatSettings,
    buildCommandMenu,
    getPreference,
    getSession,
    handleUpdate,
    TEXTPRO_COMMANDS,
    textProMenuKeyboard,
    textProListText,
  },
};
