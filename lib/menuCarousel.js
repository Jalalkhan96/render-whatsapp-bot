const fs = require('fs');
const { sendInteractiveCarousel, sendInteractiveMessage, sendMainMenuButtons, useNativeInteractive } = require('./interactiveMenu');
const menuState = require('./menuState');
const { getBotTopMedia, buildBotTopMessage } = require('./menuMedia');

// Keep the carousel deliberately small for WhatsApp mobile rendering.
const MENU_CARDS_PER_PAGE = Math.max(1, Math.min(5, Number(process.env.MENU_CARDS_PER_PAGE) || 5));
const MENU_BUTTON_COOLDOWN_MS = Math.max(
  300,
  Number(process.env.MENU_BUTTON_COOLDOWN_MS) || 700
);

const icons = {
  menu: '🏠',
  allmenu: '📚',
  smenu: '✨',
  menu2: '🚀',
  gcmenu: '🛡️',
  secmenu: '🔐',
  funmenu: '🎮',
  gamemenu: '🎮',
  edumenu: '🎓',
  studymenu: '📚',
  aimenu: '🤖',
  socialmenu: '📱',
  stalkmenu: '👤',
  newsmenu: '📰',
  editormenu: '🎬',
  voicemenu: '🎙️',
  wpmenu: '🖼️',
  cricmenu: '🏏',
  cricketonlymenu: '🏏',
  esportmenu: '🏆',
  finmenu: '💰',
};

const descriptions = {
  smenu: ['✨ Smart command center', '📊 Live command information', '⚡ Bot status and tools'],
  menu2: ['🚀 New plugin commands', '🧩 Recently added tools', '📦 Extended features'],
  gcmenu: ['👥 Group management', '🔐 Admin controls', '⚡ Moderation tools'],
  secmenu: ['🔐 Security tools', '🛡️ Protection utilities', '🔑 Security commands'],
  funmenu: ['🎮 Games and entertainment', '😂 Fun commands', '🎲 Interactive tools'],
  edumenu: ['📚 Educational tools', '📝 Study commands', '🎯 Learning utilities'],
  studymenu: ['📚 Study tools', '📝 Exam preparation', '🎯 Learning utilities'],
  aimenu: ['🤖 AI assistants', '💡 Smart tools', '🧠 AI commands'],
  socialmenu: ['📱 Social searches', '🔎 Profiles and posts', '🎬 Media discovery'],
  stalkmenu: ['👤 Public profile tools', '🔎 Public profile lookup', '📇 Social utilities'],
  newsmenu: ['📰 News sources', '🌍 Pakistan and world news', '📢 Headlines and updates'],
  editormenu: ['🎬 Editing tools', '🖼️ Creative utilities', '✨ Media tools'],
  voicemenu: ['🎙️ Voice tools', '🔊 Audio utilities', '🗣️ Language tools'],
  wpmenu: ['🖼️ Wallpapers and media', '🎞️ Image collections', '📥 Media tools'],
  cricmenu: ['🏏 Cricket updates', '📸 Player media', '🎥 Cricket tools'],
  cricketonlymenu: ['🏏 Live cricket data', '🎬 Cricket media', '🔔 Match tracking'],
  esportmenu: ['🏆 Sports and esports', '🎮 Gaming utilities', '📊 Competitive updates'],
  finmenu: ['💰 Finance and rates', '📈 Market information', '⛽ Price and utility tools'],
  menu: ['⚙️ Core bot commands', '🧰 Utility tools', '✨ ABIX control center'],
};

const categoryIcons = {
  admin: '🛡️', ai: '🤖', anime: '🍥', apks: '📦', cricket: '🏏',
  download: '📥', education: '🎓', esports: '🏆', ezgif: '🎞️', fun: '🎉',
  game: '🎮', games: '🕹️', general: '⚙️', group: '👥', image: '🖼️',
  images: '🌄', info: 'ℹ️', language: '🌐', media: '🎬', music: '🎵',
  owner: '👑', quotes: '💬', search: '🔎', security: '🔐', social: '📱',
  sports: '🏅', stickers: '🧩', study: '📖', system: '⚙️', tools: '🧰',
  utility: '🔧', upload: '⬆️', 'spotify-tools': '🎧',
};

const categoryTitles = {
  admin: 'GROUP CONTROL', ai: 'AI MENU', anime: 'ANIME MENU', apks: 'APK MENU',
  cricket: 'CRICKET MENU', download: 'DOWNLOAD MENU', education: 'EDUCATION MENU',
  esports: 'ESPORTS MENU', ezgif: 'GIF MENU', fun: 'FUN MENU', game: 'GAME MENU',
  games: 'GAMES MENU', general: 'MAIN MENU', group: 'GROUP CONTROL', image: 'IMAGE MENU',
  images: 'IMAGE MENU', info: 'INFO MENU', language: 'LANGUAGE MENU', media: 'MEDIA MENU',
  music: 'MUSIC MENU', owner: 'OWNER MENU', quotes: 'QUOTES MENU', search: 'SEARCH MENU',
  security: 'SECURITY MENU', social: 'SOCIAL MENU', sports: 'SPORTS MENU',
  stickers: 'STICKER MENU', study: 'STUDY MENU', economy: 'ECONOMY MENU', system: 'SYSTEM MENU', stalk: 'STALK MENU',
  tools: 'TOOLS MENU', upload: 'UPLOAD MENU', utility: 'UTILITY MENU', 'spotify-tools': 'SPOTIFY TOOLS',
};

const categoryDescriptions = {
  admin: 'Group administration, security\nand moderation tools.',
  ai: 'Smart AI utilities for chat,\ngeneration and assistance.',
  education: 'Learning, research and useful\nstudent utilities.',
  fun: 'Games, reactions, memes and\nlighthearted entertainment.',
  social: 'Social media search and\nprofile discovery tools.',
  security: 'Protection, privacy and\nsecurity utilities.',
};

const categoryMenuCommands = {
  admin: 'gcmenu', group: 'gcmenu', ai: 'aimenu', education: 'edumenu',
  fun: 'funmenu', game: 'funmenu', games: 'funmenu', social: 'socialmenu',
  security: 'secmenu', cricket: 'cricmenu', esports: 'esportmenu',
  study: 'studymenu', tools: 'menu', utility: 'menu', general: 'menu', 'spotify-tools': 'spltmenu',
};

const menuScopes = {
  menu: ['general', 'system'],
  gcmenu: ['admin', 'group'], aimenu: ['ai'], edumenu: ['education', 'study', 'language'],
  funmenu: ['fun', 'game', 'games', 'quotes', 'anime', 'stickers'], socialmenu: ['social', 'stalk'],
  newsmenu: ['news'], secmenu: ['security'], finmenu: ['finances', 'finance'],
  cricmenu: ['cricket'], esportmenu: ['esports', 'sports'], studymenu: ['study', 'education'],
  wpmenu: ['media', 'download', 'image', 'images'], voicemenu: ['voice', 'audio'],
  editormenu: ['editor', 'image', 'images'], ezgifmenu: ['ezgif', 'gif'],
  cricketonlymenu: ['cricket', 'sports'], gamemenu: ['game', 'games'],
  islmenu: [], pkmenu: [], fbmenu: [],
};

const MENU_COMMAND_PAGE_SIZE = 10000;

// A dedicated menu is allowed to combine live registry categories with
// command-name rules. This matters because several legacy plugins are
// registered as `general` or `info` even though their own menu is narrower.
const menuNameRules = {
  fbmenu: [
    'dl', 'facebook', 'fball', 'fbcomments', 'fbevents', 'fbgroups', 'fbpages',
    'fbpeople', 'fbplaces', 'fbposts', 'fbsearch', 'fbtop', 'fbvideos',
  ],
  aimenu: ['txt2img', 'img2img', 'txt2video', 'img2video'],
  edumenu: [
    'dictionary', 'wikipedia', 'country', 'university', 'math', 'nasa', 'mathfact',
    'calculator', 'quote', 'riddle', 'fact', 'flashcard', 'news', 'ask', 'explain',
    'quiz', 'mcq', 'studyplan', 'notes', 'html2pdf', 'img2pdf', 'currency', 'weather',
    'qr', 'shorturl', 'password',
  ],
  funmenu: [
    'gmeme', 'memesound', 'meme', 'joke', 'chuck', 'sticker', 'sticker2gif', 'tgpack',
    'memepack', 'anmereaction', 'reaction', 'reactionlist', 'kiss', 'hug', 'slap',
    'pat', 'bonk', 'cuddle', 'adviceslip', 'dailyadvice', 'lifeadvice', 'studyadvice',
    'truth', 'dare', 'chess', 'trivia', 'dog', 'cat', 'fox',
  ],
  gamemenu: [
    'ttt', 'gamestats', 'gamerank', 'gamerules', 'gamemultiplayer', 'gamebrain',
    'gamequick', 'gamequiz',
  ],
  gcmenu: [
    'add', 'antibadword', 'antilink', 'antitag', 'ban', 'character', 'chatbot',
    'compliment', 'delete', 'demote', 'giveaway', 'goodbye', 'groupinfo', 'hidetag',
    'insult', 'kick', 'mute', 'promote', 'rank', 'resetlink', 'setgdesc', 'setgname',
    'setgpp', 'ship', 'simp', 'staff', 'stupid', 'tag', 'tagall', 'tagnotadmin',
    'unban', 'unmute', 'warn', 'warnings', 'wasted', 'welcome',
  ],
  editormenu: ['getxml', 'randomxml'],
  finmenu: ['market', 'weatherinfo', 'alert', 'paknews'],
  newsmenu: ['news'],
  pkmenu: ['pknews', 'pkcurrency'],
  islmenu: [
    'islsetup', 'islstatus', 'darood', 'namaz', 'dua', 'ayatulkursi', 'kalma',
    'tasbih', 'jumma', 'hijri',
  ],
  voicemenu: ['stt', 'tts', 'translate'],
  stalkmenu: [
    'instalk', 'stalk', 'sociallinks', 'profilecard', 'handlecheck', 'usernameinfo',
    'usernamegen', 'handlelinks', 'github', 'avatar', 'userfind', 'profileqr',
    'socialqr', 'vcard', 'usernameaesthetic', 'stalkscore', 'socialcompare',
  ],
  socialmenu: [
    'ttsearch', 'ttcomments', 'ttprofile', 'ttvideo', 'igsearch', 'igprofile',
    'igcomments', 'fbsearch', 'fbposts', 'fbcomments', 'redditsearch', 'redditpost',
    'subreddit', 'pinsearch', 'pinboard', 'pinprofile', 'ytsearch', 'ytvideo',
    'ytchannel', 'xsearch', 'xprofile', 'linkedinpeople', 'linkedinposts',
    'linkedinjobs', 'threadsearch', 'threadprofile', 'thread', 'snapprofile',
  ],
  esportmenu: [
    'allsports', 'team', 'player', 'football', 'cricket', 'cricket-live', 'f1',
    'nba', 'nfl', 'dota2', 'chess',
  ],
  cricmenu: ['babar', 'king', 'kingvideo'],
  finmenu: ['balance', 'bank', 'daily', 'deposit', 'withdraw', 'transfer', 'richest', 'transactions', 'loan'],
  cricketonlymenu: [
    'cricscore', 'cricfixtures', 'cricseries', 'cricmatches', 'cricresults',
    'cricschedule', 'cricteam', 'cricplayer', 'cricstats', 'cricranking',
    'cricrecords', 'cricnews', 'cricupdates', 'cricbreaking', 'cricinjury',
    'crictransfer', 'cricretirement', 'crichighlights', 'criccommentary',
    'cricscorecard', 'cricvenue', 'cricweather', 'pakcricket', 'pakscore',
    'pakfixtures', 'pakseries', 'pakplayers', 'pakteam', 'pakranking', 'paknews',
    'pakrecords', 'pakwomen', 'paku19', 'pakdomestic', 'babarstats', 'babarrecords',
    'babarnews', 'cricalert', 'cricreminder', 'cricpoll', 'cricquiz', 'cricprediction',
  ],
};

const menuVirtualRules = {
  cricmenu: ['babar', 'king', 'kingvideo'],
  finmenu: ['balance', 'bank', 'daily', 'deposit', 'withdraw', 'transfer', 'richest', 'transactions', 'loan'],
  islmenu: ['islsetup', 'islstatus', 'darood', 'namaz', 'dua', 'ayatulkursi', 'kalma', 'tasbih', 'jumma', 'hijri'],
};

const menuNamePatterns = {
  fbmenu: [/^(?:fb|facebook)(?:$|[a-z0-9])/i],
  socialmenu: [/^(?:tt|ig|fb|reddit|subreddit|pin|x|linkedin|thread|snap|social|profile)/i],
  pkmenu: [/^pk[a-z0-9_-]*/i, /^pak[a-z0-9_-]*/i],
  islmenu: [/^isl[a-z0-9_-]*/i, /^(?:darood|namaz|dua|ayat|kalma|tasbih|jumma|hijri)$/i],
  ezgifmenu: [/^ezgif/i, /^gif/i],
  editormenu: [/xml$/i],
  voicemenu: [/^(?:voice|audio)/i],
};

// Per-chat debounce only. We intentionally do not store complete menu payloads per user.
const lastNavigation = new Map();

function normalizePrefix(prefix) {
  return String(prefix || '-');
}

function titleFor(command) {
  const clean = String(command || '').replace(/menu$/i, '');
  const title = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Main';
  return `${icons[command] || categoryIcons[command] || '📁'} ${title} MENU`;
}

function categoryTitle(category) {
  return categoryTitles[category] || `${categoryIcons[category] || '📁'} ${String(category).toUpperCase()} MENU`;
}

function flagEnabled(value) {
  return value === true || value === 1 ||
    (typeof value === 'string' && ['true', '1', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase()));
}

function isOwnerRestricted(command) {
  const category = String(command?.category || '').trim().toLowerCase();
  return category === 'owner' || flagEnabled(command?.ownerOnly) || flagEnabled(command?.strictOwnerOnly);
}

function shouldExposeCommand(command, viewerIsOwner = false) {
  if (!command) return false;
  if (command.hiddenFromMenu === true || command.hidden === true) return false;
  return viewerIsOwner || !isOwnerRestricted(command);
}

function categoryCommand(category) {
  return categoryMenuCommands[category] || `${category}menu`;
}

function displayCategory(menuCommand) {
  if (menuCommand === 'gcmenu') return 'group';
  if (menuCommand === 'aimenu') return 'ai';
  if (menuCommand === 'edumenu') return 'education';
  if (menuCommand === 'funmenu') return 'fun';
  if (menuCommand === 'socialmenu') return 'social';
  if (menuCommand === 'secmenu') return 'security';
  if (menuCommand === 'cricmenu') return 'cricket';
  if (menuCommand === 'esportmenu') return 'esports';
  return menuCommand.replace(/menu$/i, '');
}

function uniqueByCommand(entries) {
  const seen = new Set();
  return entries.filter(([name]) => {
    const key = String(name).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function commandsForMenu(commandHandler, menuCommand, viewerIsOwner = false) {
  const key = String(menuCommand || '').toLowerCase();
  const scopes = menuScopes[key] || [];
  const explicitRules = Object.prototype.hasOwnProperty.call(menuNameRules, key)
    ? new Set(menuNameRules[key].map(value => String(value).toLowerCase()))
    : null;
  const patterns = menuNamePatterns[key] || [];
  const allCommands = key === 'smenu';
  const commands = [];
  const seen = new Set();

  for (const command of commandHandler.commands.values()) {
    const name = String(command?.command || '').trim().toLowerCase();
    const category = String(command?.category || 'other').trim().toLowerCase();
    if (!name || name === 'allmenu' || name === key || name.endsWith('menu') || !shouldExposeCommand(command, viewerIsOwner)) continue;

    const categoryMatch = scopes.includes(category);
    const explicitMatch = explicitRules ? explicitRules.has(name) : false;
    const patternMatch = patterns.some(pattern => pattern.test(name));
    const groupMatch = key === 'gcmenu' && (command.groupOnly || command.adminOnly || category === 'group' || category === 'admin');

    // When a menu has an explicit catalog, that catalog is authoritative.
    // Otherwise fall back to category/pattern discovery for legacy menus.
    const include = allCommands || (explicitRules ? explicitMatch : categoryMatch || patternMatch || groupMatch);

    if (include && !seen.has(name)) {
      seen.add(name);
      commands.push({ name, command });
    }
  }

  // Explicit catalogs are authoritative for dedicated menu pages. Add any
  // catalog entries that are implemented as sub-actions or are bundled in a
  // multi-command plugin and therefore do not appear as separate registry
  // entries.
  if (explicitRules) {
    for (const name of explicitRules) {
      if (!name || name.endsWith('menu') || seen.has(name)) continue;
      seen.add(name);
      commands.push({ name, command: null });
    }
  }

  // Some menu modules expose feature commands as aliases/dispatch targets
  // rather than separate registry commands. Keep those visible in the menu.
  if (key === 'islmenu') {
    const menuPlugin = commandHandler.commands.get(key);
    for (const alias of (menuPlugin?.aliases || [])) {
      const name = String(alias || '').toLowerCase();
      if (!name || name.endsWith('menu') || seen.has(name)) continue;
      seen.add(name);
      commands.push({ name, command: menuPlugin });
    }
  }

  for (const name of (menuVirtualRules[key] || [])) {
    const normalized = String(name).toLowerCase();
    if (!normalized || normalized.endsWith('menu') || seen.has(normalized)) continue;
    seen.add(normalized);
    commands.push({ name: normalized, command: null });
  }

  return commands;
}

/** Discover actual menu plugins; command lists come from the live registry. */
function discoverMenus(commandHandler, viewerIsOwner = false) {
  const entries = [];
  for (const command of commandHandler.commands.values()) {
    const name = String(command?.command || '').toLowerCase();
    if (!name.endsWith('menu') || name === 'allmenu' || !shouldExposeCommand(command, viewerIsOwner) || entries.some(([key]) => key === name)) continue;
    entries.push([name, {
      command: name,
      commands: commandsForMenu(commandHandler, name, viewerIsOwner),
      description: command.description || `${name.replace(/menu$/i, '')} commands`,
    }]);
  }
  if (!entries.some(([name]) => name === 'menu')) entries.unshift(['menu', { command: 'menu', commands: [], description: 'Core bot controls' }]);
  return entries;
}

function quickReply(display_text, id) {
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text, id }),
  };
}

function uniqueRegisteredCommands(commandHandler, viewerIsOwner = false) {
  const commands = new Map();
  for (const command of commandHandler.commands.values()) {
    const name = String(command?.command || '').toLowerCase();
    if (name && shouldExposeCommand(command, viewerIsOwner) && !commands.has(name)) commands.set(name, command);
  }
  return [...commands.values()];
}

function commandGroups(commandHandler, category = '', viewerIsOwner = false) {
  const groups = new Map();
  const wanted = String(category || '').toLowerCase();
  for (const command of uniqueRegisteredCommands(commandHandler, viewerIsOwner)) {
    const commandCategory = String(command.category || 'other').toLowerCase();
    if (wanted && commandCategory !== wanted) continue;
    if (!shouldExposeCommand(command, viewerIsOwner)) continue;
    if (!groups.has(commandCategory)) groups.set(commandCategory, []);
    groups.get(commandCategory).push(command);
  }
  return groups;
}

function buildMenu2Text(commandHandler, prefix, category = '', scopedCategories = null, viewerIsOwner = false) {
  const groups = commandGroups(commandHandler, category, viewerIsOwner);
  if (Array.isArray(scopedCategories)) {
    for (const group of groups.keys()) {
      if (!scopedCategories.includes(group)) groups.delete(group);
    }
  }
  const total = [...groups.values()].reduce((count, commands) => count + commands.length, 0);
  const title = category ? `${String(category).toUpperCase()} MENU` : 'ALL COMMAND FLOW';
  const lines = [
    `╭───「 ✨ *ABIX-AE ${title}* 」`,
    `│ 📁 *Category:* ${category || 'all'}`,
    `│ 📊 *Total Commands:* ${total}`,
    '╰───────────────○',
    '',
  ];
  for (const [group, commands] of groups) {
    lines.push(`*${group.toUpperCase()}*`, '┌─────────────────');
    // commands.sort((left, right) => String(left.command).localeCompare(String(right.command)));
    commands.forEach((command, index) => {
      const branch = index === commands.length - 1 ? '└' : '├';
      lines.push(`${branch}─ ⚡ ${prefix}${command.command}`);
    });
    lines.push('');
  }
  lines.push('Powered by TEAM ABIX');
  return lines.join('\n');
}

async function sendMenu2Style(sock, message, chatId, commandHandler, prefix, category = '', viewerIsOwner = false) {
  const menuKey = String(category || '').toLowerCase();
  const text = buildMenu2Text(
    commandHandler,
    prefix,
    menuScopes[menuKey] ? '' : category,
    menuScopes[menuKey] || null,
    viewerIsOwner
  );
  const content = buildBotTopMessage(text, { _skipMenuCard: true });
  try {
    return await sock.sendMessage(chatId, content, { quoted: message });
  } catch (error) {
    console.error('[MENU] Video menu send failed:', error.message);
    return sock.sendMessage(chatId, { text, _skipMenuCard: true }, { quoted: message });
  }
}

async function sendMainMenu(sock, message, chatId, commandHandler, prefix, viewerIsOwner = false) {
  const commands = uniqueRegisteredCommands(commandHandler, viewerIsOwner);
  const body = [
    `✦ *${settingsBotName()}* ✦`,
    '',
    '⚡ Status : *ONLINE*',
    `🔑 Prefix : *${prefix}*`,
    `📦 Commands : *${commands.length}*`,
    '',
    `${settingsBotName()} is your all-in-one`,
    'WhatsApp command center.',
    '',
    '📋 *QUICK ACTIONS*',
    `1. ${prefix}menu categories`,
    `2. ${prefix}allmenu`,
    `3. ${prefix}menu group`,
    '',
    `Use *${prefix}menu <section>* to open a specific menu.`,
  ].join('\n');

  // The top media is type-aware: image stays an image, GIF is sent as a
  // WhatsApp GIF (MP4 + gifPlayback), and video stays a normal video.
  // The media transport is deliberately separate from the button transport so
  // a native-flow failure can never turn the actual menu media into an
  // unsupported-message placeholder.
  try {
    const media = getBotTopMedia();
    if (media) {
      await sock.sendMessage(
        chatId,
        { ...buildBotTopMessage(body), _skipMenuCard: true },
        { quoted: message }
      );
    } else {
      await sock.sendMessage(chatId, {
        text: body,
        _skipMenuCard: true,
        contextInfo: {},
      }, { quoted: message });
    }

    // Buttons are a separate compact interaction message. This keeps the real
    // media message on a standard Baileys image/video path and isolates the
    // client-sensitive native-flow transport to the optional controls.
    await sendMainMenuButtons(sock, chatId, {
      prefix,
      quoted: message,
      title: `${settingsBotName()} • MAIN MENU`,
      footer: 'TEAM ABIX',
    });

    return null;
  } catch (error) {
    console.warn('[MENU] Main menu media/buttons send failed:', error.message);
    return sock.sendMessage(chatId, {
      text: `${body}\n\n📋 ${prefix}menu categories\n📚 ${prefix}allmenu\n👥 ${prefix}menu group`,
      _skipMenuCard: true,
      contextInfo: {},
    }, { quoted: message });
  }
}

function settingsBotName() {
  return require('../settings').botName || 'myBOT';
}

// Backward-compatible name used by older ABIX menu imports.
async function sendNativeMainMenu(sock, message, chatId, commandHandler, prefix) {
  return sendMainMenu(sock, message, chatId, commandHandler, prefix);
}

function buildOnlyMenuText(commandHandler, prefix) {
  const entries = discoverMenus(commandHandler)
    .map(([command]) => ({ command }))
    .filter(entry => entry.command !== 'allmenu' && entry.command !== 'onlymenu');
  const lines = [
    '╭───「 📚 *ABIX-AE MENU LIST* 」',
    `│ 📊 *Total Menus:* ${entries.length}`,
    '╰───────────────○',
    '',
  ];
  entries.forEach((entry, index) => {
    const branch = index === entries.length - 1 ? '└' : '├';
    lines.push(`${branch}─ ⚡ ${prefix}${entry.command}`);
  });
  lines.push('', 'Powered by TEAM ABIX');
  return lines.join('\n');
}

async function sendOnlyMenu(sock, message, chatId, commandHandler, prefix, viewerIsOwner = false) {
  const text = buildOnlyMenuText(commandHandler, prefix);
  const content = buildBotTopMessage(text, { _skipMenuCard: true });
  try {
    return await sock.sendMessage(chatId, content, { quoted: message });
  } catch (error) {
    console.error('[MENU] Only-menu send failed:', error.message);
    return sock.sendMessage(chatId, { text, _skipMenuCard: true }, { quoted: message });
  }
}

async function sendCategoryMenu(sock, message, chatId, commandHandler, prefix, viewerIsOwner = false) {
  const rows = [...new Set(uniqueRegisteredCommands(commandHandler, viewerIsOwner)
    .map(command => String(command.category || 'other').toLowerCase()))]
    .filter(category => category !== 'other')
    .map(category => ({
      title: `${categoryIcons[category] || '📁'} ${String(category).toUpperCase()}`,
      id: `menu_category:${category}`, 
    }));
  const buttons = [{
    name: 'single_select',
    buttonParamsJson: JSON.stringify({
      title: '📂 OPEN MENU',
      sections: [{ title: 'ABIX-AE MODULES', rows }],
    }),
  }, quickReply('🏠 MAIN', `${prefix}menu`), quickReply('📚 ALL', `${prefix}allmenu`)];
  const body = '✦ *ABIX-AE COMMAND MENU* ✦\n\nSelect the section you need.';

  try {
    return await sendInteractiveMessage(sock, chatId, {
      body,
      footer: 'Powered by TEAM ABIX',
      buttons,
    }, { quoted: message, nativeInteractive: true });
  } catch (error) {
    console.error('[MENU] Category menu send failed:', error.message);
    const text = rows.map(row => `${row.title}\n${row.id}`).join('\n\n');
    return sock.sendMessage(chatId, { text: `${body}\n\n${text}\n\nPowered by TEAM ABIX` }, { quoted: message });
  }
}

async function sendAllCommandFlow(sock, message, chatId, commandHandler, prefix, viewerIsOwner = false) {
  const grouped = new Map();
  for (const command of uniqueRegisteredCommands(commandHandler, viewerIsOwner)) {
    const category = String(command.category || 'other').toLowerCase();
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(command);
  }

  const lines = [
    '✦━━━━━━━━━━━━━━━━━━━━✦',
    ' *ABIX-AE*',
    ' COMMAND FLOW',
    '✦━━━━━━━━━━━━━━━━━━━━✦',
    '',
    '⚡ Status : *ONLINE*',
    `🔑 Prefix : *${prefix}*`,
    `📦 Commands : *${[...grouped.values()].reduce((total, list) => total + list.length, 0)}*`,
  ];
  let number = 1;
  for (const [category, commands] of grouped) {
    lines.push('', `${categoryIcons[category] || '📁'} *${category.toUpperCase()}*`, '────────────────────');
    for (const command of commands) {
      lines.push(`${String(number++).padStart(2, '0')} › *${prefix}${command.command}*`, '');
    }
  }
  lines.push('✦━━━━━━━━━━━━━━━━━━━━✦', '', `Use *${prefix}menu* to return to the ABIX-AE command center.`, '', 'Powered by TEAM ABIX');
  return sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
}

function buildMenuCard(command, info, prefix, currentPage, totalPages, absoluteIndex, totalEntries) {
  const menuCommand = categoryCommand(command);
  const title = `${categoryIcons[command] || '📁'} ${categoryTitle(command)}`;

  const body = [
    title,
    '',
    `📦 ${info?.commands?.length || 0} commands`,
  ].filter(Boolean).join('\n');

  return {
    header: { title },
    body,
    footer: `ABIX • Page ${currentPage}/${totalPages} • ${absoluteIndex + 1}/${totalEntries}`,
    buttons: [
      quickReply(`${categoryIcons[command] || '📁'} OPEN ${menuCommand.toUpperCase()}`, `menu_open:${menuCommand}`),
      quickReply('🏠 MAIN', `${prefix}menu`),
      quickReply('📚 ALL', `${prefix}allmenu`),
    ],
  };
}

function buildNavigationButtons(prefix, currentPage, totalPages, rootCommand = 'menu') {
  const buttons = [];

  if (currentPage > 1) {
    buttons.push(
      quickReply('⬅️ BACK', `${prefix}${rootCommand} page ${currentPage - 1}`)
    );
  }

  if (currentPage < totalPages) {
    buttons.push(
      quickReply('➡️ NEXT', `${prefix}${rootCommand} page ${currentPage + 1}`)
    );
  }

  return buttons;
}

function buildMenuCards(commandHandler, prefix, page = 1, rootCommand = 'menu', viewerIsOwner = false) {
  const entries = discoverMenus(commandHandler, viewerIsOwner);
  const totalPages = Math.max(1, Math.ceil(entries.length / MENU_CARDS_PER_PAGE));
  const currentPage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const start = (currentPage - 1) * MENU_CARDS_PER_PAGE;
  const pageEntries = entries.slice(start, start + MENU_CARDS_PER_PAGE);

  const cards = pageEntries.map(([command, info], index) =>
    buildMenuCard(
      command,
      info,
      prefix,
      currentPage,
      totalPages,
      start + index,
      entries.length
    )
  );

  // Navigation is attached to the final card only. This keeps every other
  // card small and avoids a large number of interactive buttons.
  const navigation = buildNavigationButtons(prefix, currentPage, totalPages, rootCommand);
  if (cards.length && navigation.length) {
    cards[cards.length - 1].buttons.push(...navigation);
  }

  return {
    cards,
    currentPage,
    totalPages,
    totalEntries: entries.length,
  };
}

function canNavigate(chatId) {
  const key = String(chatId || '');
  const now = Date.now();
  const previous = lastNavigation.get(key) || 0;
  if (now - previous < MENU_BUTTON_COOLDOWN_MS) return false;
  lastNavigation.set(key, now);
  return true;
}

function fallbackText(result, prefix, rootCommand = 'menu') {
  const cardsText = result.cards.map((card) => card.body).join('\n\n────────────\n\n');
  const nav = buildNavigationButtons(prefix, result.currentPage, result.totalPages, rootCommand)
    .map((button) => {
      try {
        const p = JSON.parse(button.buttonParamsJson);
        return `• ${p.id}`;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return [
    `📚 *ABIX-AE MENU*`,
    `Page ${result.currentPage}/${result.totalPages} • ${result.totalEntries} menus`,
    '',
    cardsText,
    nav.length ? `\nNavigation:\n${nav.join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

function categoryEntries(commandHandler, category, viewerIsOwner = false) {
  const categories = menuScopes[category] || (category === 'admin' || category === 'group'
    ? ['admin', 'group']
    : [category]);
  const entries = [];
  for (const command of commandHandler.commands.values()) {
    const name = String(command?.command || '').toLowerCase();
    const commandCategory = String(command?.category || 'other').toLowerCase();
    if (!name || name.endsWith('menu') || !categories.includes(commandCategory) || name === 'allmenu' || !shouldExposeCommand(command, viewerIsOwner)) continue;
    if (!entries.some(item => item.name === name)) entries.push({ name, command });
  }
  return entries;
}

function buildCategoryCommandList(commandHandler, category, prefix, page = 1, viewerIsOwner = false) {
  const entries = categoryEntries(commandHandler, category, viewerIsOwner);
  const pageSize = 28;
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const currentPage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const pageEntries = entries.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleCategory = displayCategory(category);
  const title = `${categoryIcons[visibleCategory] || '📁'} ${categoryTitle(visibleCategory)}`;
  const lines = [
    `╭━━━〔 ${title} 〕━━━╮`,
    '┃',
    `┃ ${categoryIcons[visibleCategory] || '📁'} COMMANDS`,
    '┃',
    ...pageEntries.map(item => `┃ ${prefix}${item.name}`),
    '┃',
    `┃ Page ${currentPage}/${totalPages}`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
  ];
  return { text: lines.join('\n'), currentPage, totalPages, totalEntries: entries.length };
}

async function sendCategoryCommandList(sock, message, chatId, commandHandler, category, prefix, page = 1, viewerIsOwner = false) {
  const result = buildCategoryCommandList(commandHandler, category, prefix, page, viewerIsOwner);
  const buttons = [quickReply('🏠 MAIN MENU', `${prefix}menu`)];
  if (result.currentPage > 1) buttons.push(quickReply('⬅️ BACK', `${prefix}menu ${category} page ${result.currentPage - 1}`));
  if (result.currentPage < result.totalPages) buttons.push(quickReply('➡️ NEXT', `${prefix}menu ${category} page ${result.currentPage + 1}`));
  try {
    return await require('./interactiveMenu').sendInteractiveMessage(sock, chatId, {
      body: result.text,
      footer: 'Powered by TEAM ABIX',
      buttons,
    }, { quoted: message, nativeInteractive: true });
  } catch (error) {
    console.error('[MENU] Command-list send failed:', error.message);
    return sock.sendMessage(chatId, { text: `${result.text}\n\n🏠 ${prefix}menu\n\nPowered by TEAM ABIX` }, { quoted: message });
  }
}

function parseMenuPage(args) {
  const first = String(args?.[0] || '').toLowerCase();
  const value = first === 'page' ? args?.[1] : args?.[0];
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function buildDedicatedMenuText(commandHandler, prefix, menuCommand, viewerIsOwner = false) {
  const key = String(menuCommand || '').toLowerCase();
  const isAll = key === 'allmenu';
  const entries = isAll
    ? uniqueRegisteredCommands(commandHandler)
        .filter(command => !String(command.command).toLowerCase().endsWith('menu'))
        .map(command => ({ name: String(command.command).toLowerCase(), command }))
    : commandsForMenu(commandHandler, key, viewerIsOwner);

  const total = entries.length;
  const icon = icons[key] || '📁';
  const title = isAll ? 'ALL COMMANDS' : `${String(key).replace(/menu$/i, '').toUpperCase()} MENU`;

  const lines = [
    `╭━━━〔 ${icon} *ABIX-AE ${title}* 〕━━━╮`,
    `┃ 📦 Total Commands : *${total}*`,
    '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '┏━━〔 ⚡ COMMANDS 〕━━┓',
  ];

  if (!entries.length) {
    lines.push('┃ No commands registered for this menu.');
  } else {
    entries.forEach((entry, index) => {
      const number = String(index + 1).padStart(2, '0');
      lines.push(`┃ ${number} • ${prefix}${entry.name}`);
    });
  }

  lines.push('┗━━━━━━━━━━━━━━━━━━━━━━┛', '', `🏠 ${prefix}menu`, '', '✨ Powered by TEAM ABIX');
  return { text: lines.join('\n'), total };
}

async function sendDedicatedMenu(sock, message, chatId, commandHandler, prefix, menuCommand, viewerIsOwner = false) {
  const key = String(menuCommand || '').toLowerCase();
  const result = buildDedicatedMenuText(commandHandler, prefix, key, viewerIsOwner);
  // Dedicated menus share the same dynamic bot-top media. No forwarded or
  // channel metadata is added.
  const content = buildBotTopMessage(result.text, { _skipMenuCard: true });

  try {
    return await sock.sendMessage(chatId, content, { quoted: message });
  } catch (error) {
    console.error(`[MENU:${key}] dedicated send failed:`, error.message);
    return sock.sendMessage(chatId, { text: result.text, contextInfo: {} }, { quoted: message });
  }
}

async function sendMenuCarousel(sock, message, chatId, commandHandler, prefix, page = 1, options = {}) {
  const normalizedPrefix = normalizePrefix(prefix);
  const rootCommand = String(options.rootCommand || 'menu').toLowerCase() === 'allmenu' ? 'allmenu' : 'menu';
  const result = buildMenuCards(commandHandler, normalizedPrefix, page, rootCommand, Boolean(options.viewerIsOwner));

  // Page 1 gets a compact introduction. Do not put the complete command list
  // into the carousel; the individual menu opens the real existing command.
  const body = [
    options.title || '📚 *ABIX-AE MENU*',
    result.currentPage === 1
      ? 'Choose a menu below. Each OPEN button launches the existing menu.'
      : `Slider page ${result.currentPage}/${result.totalPages}`,
    `📦 ${result.totalEntries} menus • ${result.currentPage}/${result.totalPages}`,
  ].join('\n');

  try {
    return await sendInteractiveCarousel(sock, chatId, {
      body,
      footer: 'ABIX-AE • Menu Slider',
      cards: result.cards,
    }, { quoted: message, nativeInteractive: true });
  } catch (error) {
    console.error('[MENU] Carousel send failed:', error.message);
    return sock.sendMessage(chatId, {
      text: fallbackText(result, normalizedPrefix, rootCommand),
    }, { quoted: message });
  }
}

async function sendMenuPageFromInteraction(sock, message, chatId, commandHandler, prefix, page) {
  if (!canNavigate(chatId)) return;
  return sendMenuCarousel(sock, message, chatId, commandHandler, prefix, page, { rootCommand: 'menu' });
}

module.exports = {
  discoverMenus,
  buildMenuCards,
  buildMenu2Text,
  sendMenu2Style,
  sendDedicatedMenu,
  buildOnlyMenuText,
  sendOnlyMenu,
  sendMainMenu,
  sendNativeMainMenu,
  sendCategoryMenu,
  sendAllCommandFlow,
  sendMenuCarousel,
  buildCategoryCommandList,
  sendCategoryCommandList,
  sendMenuPageFromInteraction,
  canNavigate,
  MENU_CARDS_PER_PAGE,
  MENU_BUTTON_COOLDOWN_MS,
  MENU_COMMAND_PAGE_SIZE,
};
