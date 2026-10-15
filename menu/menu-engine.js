'use strict';

const { getPermission, Permission } = require('../lib/permissions');

const categories = Object.freeze([
  { id: 'group', title: 'GROUP', icon: 'GROUP', matches: ['admin', 'group'] },
  { id: 'education', title: 'EDUCATION', icon: 'EDU', matches: ['education', 'study', 'language'] },
  { id: 'pakistan', title: 'PAKISTAN', icon: 'PK', matches: ['pakistan'], commandPattern: /^(?:pak|pk)/i },
  { id: 'cricket', title: 'CRICKET', icon: 'CRICKET', matches: ['cricket', 'sports'] },
  { id: 'download', title: 'DOWNLOAD', icon: 'DOWNLOAD', matches: ['download', 'media'] },
  { id: 'ai', title: 'AI', icon: 'AI', matches: ['ai'] },
  { id: 'search', title: 'SEARCH', icon: 'SEARCH', matches: ['search', 'social', 'stalk', 'social-search'] },
  { id: 'games', title: 'GAMES', icon: 'GAMES', matches: ['game', 'games', 'fun'] },
  { id: 'islamic', title: 'ISLAMIC', icon: 'ISLAMIC', matches: ['islamic'], commandPattern: /^(?:isl|darood|namaz|dua|kalma|tasbih|jumma|hijri)/i },
  { id: 'owner', title: 'OWNER', icon: 'OWNER', matches: ['owner'] },
  { id: 'economy', title: 'ECONOMY', icon: 'ECONOMY', matches: ['economy'] },
  { id: 'settings', title: 'SETTINGS', icon: 'SETTINGS', matches: ['system'], commands: ['settings', 'setprefix', 'mode'] },
]);

function canShow(command, viewer) {
  if (!command || command.hidden === true || command.hiddenFromMenu === true) return false;
  const permission = getPermission(command);
  if (permission === Permission.PRIMARY_OWNER) return Boolean(viewer?.isPrimaryOwner);
  if (permission === Permission.OWNER) return Boolean(viewer?.isOwner);
  return true;
}

function commandEntries(commandHandler, category, viewer) {
  const rule = categories.find((entry) => entry.id === String(category).toLowerCase());
  if (!rule) return [];

  return [...commandHandler.commands.values()]
    .filter((command) => canShow(command, viewer))
    .filter((command) => {
      const name = String(command.command || '').toLowerCase();
      const commandCategory = String(command.category || '').toLowerCase();
      return rule.matches.includes(commandCategory) || rule.commands?.includes(name) || rule.commandPattern?.test(name);
    })
    .filter((command, index, all) => all.findIndex((entry) => entry.command === command.command) === index)
    .sort((a, b) => String(a.command).localeCompare(String(b.command)));
}

function categoryEntries(commandHandler, viewer) {
  return categories
    .map((category) => ({ ...category, commands: commandEntries(commandHandler, category.id, viewer) }))
    .filter((category) => category.commands.length);
}

module.exports = { categories, commandEntries, categoryEntries, canShow };
