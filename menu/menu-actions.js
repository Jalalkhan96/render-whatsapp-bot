'use strict';

const fixedActions = Object.freeze({
  menu_main: 'menu',
  menu_all: 'allmenu',
  menu_categories: 'menu categories',
  menu_back: 'menu',
  menu_home: 'menu',
  menu_group: 'menu group',
  menu_education: 'menu education',
  menu_pakistan: 'menu pakistan',
  menu_cricket: 'menu cricket',
  menu_download: 'menu download',
  menu_ai: 'menu ai',
  menu_search: 'menu search',
  menu_games: 'menu games',
  menu_islamic: 'menu islamic',
  menu_owner: 'menu owner',
  menu_settings: 'menu settings',
});

function resolveMenuAction(actionId, prefix) {
  const action = String(actionId || '').trim();
  if (!action) return null;
  if (fixedActions[action]) return `${prefix}${fixedActions[action]}`;

  const category = action.match(/^menu_category:([a-z0-9_-]+)$/i);
  if (category) return `${prefix}menu ${category[1].toLowerCase()}`;

  const open = action.match(/^menu_open:([a-z0-9_-]+)$/i);
  if (open) return `${prefix}${open[1].toLowerCase()}`;

  return null;
}

module.exports = { fixedActions, resolveMenuAction };
