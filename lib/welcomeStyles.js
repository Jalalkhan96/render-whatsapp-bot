'use strict';

const { loadUserGroupData, saveUserGroupData, addWelcome, addGoodbye } = require('./index');

const DEFAULT_CONFIG = Object.freeze({
  welcomeStyle: 1,
  goodbyeStyle: 1,
});

const WELCOME_STYLES = Object.freeze({
  1: ({ user, group, count, time, description }) => [
    '╭━━━〔 ✨ WELCOME ✨ 〕━━━╮',
    `┃ 👤 ${user}`,
    `┃ 🎉 Welcome to *${group}*`,
    `┃ 👥 Members: *${count}*`,
    `┃ 🕒 ${time}`,
    '┃',
    `┃ ${description ? '📜 ' + description : '💬 Please follow the group rules and enjoy your stay.'}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '🤖 *ABIX-AE* • All-in-one WhatsApp command center',
  ].join('\n'),
  2: ({ user, group, count, time }) => [
    '┏━━━━━━━━━━━━━━━━━━━━━━┓',
    '┃     🌟 *NEW MEMBER* 🌟',
    '┣━━━━━━━━━━━━━━━━━━━━━━┫',
    `┃ 👋 Hello ${user}`,
    `┃ 🏠 ${group}`,
    `┃ 👥 ${count} members now`,
    `┃ 🕒 ${time}`,
    '┃',
    '┃ ❤️ Be respectful • Stay active',
    '┃ 🚫 No spam • No abuse',
    '┗━━━━━━━━━━━━━━━━━━━━━━┛',
  ].join('\n'),
  3: ({ user, group, count, time, description }) => [
    '╔════════════════════════╗',
    '║ 🎊 *WELCOME ABOARD* 🎊',
    '╠════════════════════════╣',
    `║ 👤 Member : ${user}`,
    `║ 🏷️ Group  : ${group}`,
    `║ 👥 Total  : ${count}`,
    `║ 🕒 Time   : ${time}`,
    '║',
    `║ ${description ? '📝 ' + description : 'Make yourself comfortable and have a great time!'}`,
    '╚════════════════════════╝',
  ].join('\n'),
  4: ({ user, group, count, time }) => [
    '✦•┈๑⋅⋯  🌸 WELCOME 🌸  ⋯⋅๑┈•✦',
    '',
    `✨ ${user} just joined *${group}*!`,
    `👥 Community size: *${count}*`,
    `🕒 Joined: ${time}`,
    '',
    '💫 Introduce yourself and enjoy the community.',
    '✦•┈๑⋅⋯⋯⋯⋅๑┈•✦',
  ].join('\n'),
  5: ({ user, group, count, time }) => [
    '╭──────────────────────╮',
    '│ 🛰️ *ABIX COMMUNITY*',
    '├──────────────────────┤',
    `│ ✅ Joined: ${user}`,
    `│ 📍 Group : ${group}`,
    `│ 📊 Count : ${count}`,
    `│ ⏱️ Time  : ${time}`,
    '│',
    '│ 🔔 Check the rules, then say hello!',
    '╰──────────────────────╯',
  ].join('\n'),
});

const GOODBYE_STYLES = Object.freeze({
  1: ({ user, group, count, time }) => [
    '╭━━━〔 👋 GOODBYE 〕━━━╮',
    `┃ 🚪 ${user} left the group`,
    `┃ 👥 Group: *${group}*`,
    `┃ 📊 Members: *${count}*`,
    `┃ 🕒 ${time}`,
    '┃',
    '┃ We wish you the best ahead. ✨',
    '╰━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '🤖 *ABIX-AE*',
  ].join('\n'),
  2: ({ user, group, count, time }) => [
    '┏━━━━━━━━━━━━━━━━━━━━━━┓',
    '┃     🕊️ *MEMBER LEFT*',
    '┣━━━━━━━━━━━━━━━━━━━━━━┫',
    `┃ 👤 ${user}`,
    `┃ 🏠 ${group}`,
    `┃ 👥 ${count} members remain`,
    `┃ 🕒 ${time}`,
    '┃',
    '┃ Take care and come back anytime. 🤍',
    '┗━━━━━━━━━━━━━━━━━━━━━━┛',
  ].join('\n'),
  3: ({ user, group, count, time }) => [
    '╔════════════════════════╗',
    '║ 🚪 *MEMBER UPDATE*',
    '╠════════════════════════╣',
    `║ 👤 User  : ${user}`,
    `║ 🏷️ Group : ${group}`,
    `║ 👥 Left  : ${count} members remain`,
    `║ 🕒 Time  : ${time}`,
    '║',
    '║ 👋 Thanks for being part of us.',
    '╚════════════════════════╝',
  ].join('\n'),
  4: ({ user, group, count, time }) => [
    '✦•┈๑⋅⋯  💙 FAREWELL  ⋯⋅๑┈•✦',
    '',
    `${user} has left *${group}*.`,
    `👥 Members remaining: *${count}*`,
    `🕒 ${time}`,
    '',
    '🌿 May your next journey go well.',
    '✦•┈๑⋅⋯⋯⋯⋅๑┈•✦',
  ].join('\n'),
  5: ({ user, group, count, time }) => [
    '╭──────────────────────╮',
    '│ 📡 *GROUP ACTIVITY*',
    '├──────────────────────┤',
    `│ 👤 Left  : ${user}`,
    `│ 📍 Group : ${group}`,
    `│ 📊 Count : ${count}`,
    `│ ⏱️ Time  : ${time}`,
    '│',
    '│ 👋 Farewell & stay safe.',
    '╰──────────────────────╯',
  ].join('\n'),
});

function clampStyle(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

async function getWelcomeStyleConfig(groupId) {
  const data = await loadUserGroupData();
  const item = data.welcomeStyles?.[groupId] || {};
  return {
    ...DEFAULT_CONFIG,
    welcomeStyle: clampStyle(item.welcomeStyle) || DEFAULT_CONFIG.welcomeStyle,
    goodbyeStyle: clampStyle(item.goodbyeStyle) || DEFAULT_CONFIG.goodbyeStyle,
  };
}

async function setWelcomeStyleConfig(groupId, patch) {
  const data = await loadUserGroupData();
  if (!data.welcomeStyles || typeof data.welcomeStyles !== 'object') data.welcomeStyles = {};
  const current = await getWelcomeStyleConfig(groupId);
  const next = { ...current };
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'welcomeStyle')) {
    const n = clampStyle(patch.welcomeStyle);
    if (n) next.welcomeStyle = n;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'goodbyeStyle')) {
    const n = clampStyle(patch.goodbyeStyle);
    if (n) next.goodbyeStyle = n;
  }
  data.welcomeStyles[groupId] = next;
  await saveUserGroupData(data);
  return next;
}

function formatTime(date = new Date()) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: process.env.TIMEZONE || 'Asia/Karachi',
  });
}

function renderWelcomeStyle(style, vars) {
  const renderer = WELCOME_STYLES[clampStyle(style) || DEFAULT_CONFIG.welcomeStyle];
  return renderer(vars);
}

function renderGoodbyeStyle(style, vars) {
  const renderer = GOODBYE_STYLES[clampStyle(style) || DEFAULT_CONFIG.goodbyeStyle];
  return renderer(vars);
}

function styleListText() {
  return [
    '*Welcome/Leave Styles*',
    '',
    '1. ✨ Classic',
    '2. 🌟 Card',
    '3. 🎊 Detailed',
    '4. 🌸 Minimal',
    '5. 🛰️ ABIX',
  ].join('\n');
}

async function configureWelcomeing(groupId, mode, value) {
  const m = String(mode || '').toLowerCase();
  const v = String(value || '').toLowerCase();

  if (m === 'on') {
    await addWelcome(groupId, true, null);
    await addGoodbye(groupId, true, null);
    return { ok: true, message: '✅ Welcome + leave messages enabled.' };
  }
  if (m === 'off') {
    await addWelcome(groupId, false, null);
    await addGoodbye(groupId, false, null);
    return { ok: true, message: '✅ Welcome + leave messages disabled.' };
  }

  if (['welcome', 'join'].includes(m)) {
    const enabled = ['on', 'true', '1'].includes(v);
    await addWelcome(groupId, enabled, null);
    return { ok: true, message: `✅ Welcome messages ${enabled ? 'enabled' : 'disabled'}.` };
  }

  if (['leave', 'goodbye'].includes(m)) {
    const enabled = ['on', 'true', '1'].includes(v);
    await addGoodbye(groupId, enabled, null);
    return { ok: true, message: `✅ Leave messages ${enabled ? 'enabled' : 'disabled'}.` };
  }

  return { ok: false };
}

module.exports = {
  getWelcomeStyleConfig,
  setWelcomeStyleConfig,
  renderWelcomeStyle,
  renderGoodbyeStyle,
  formatTime,
  styleListText,
  configureWelcomeing,
};
