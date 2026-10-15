'use strict';
const { makeSingleSelect, buildNativeFlowContent } = require('../nativeFlow');

const sections = [
  {
    title: 'ABIX-AE CATEGORIES',
    rows: [
      { title: '⚡ AI', description: 'AI tools', id: '-aimenu' },
      { title: '📘 FACEBOOK', description: 'Facebook tools', id: '-fbmenu' },
      { title: '🎵 MEDIA', description: 'Media tools', id: '-smenu' },
      { title: '🛡️ GROUP', description: 'Group tools', id: '-gcmenu' },
      { title: '📿 ISLAMIC', description: 'Islamic tools', id: '-islmenu' },
      { title: '🏏 CRICKET', description: 'Cricket tools', id: '-cricmenu' },
      { title: '🎮 GAMES', description: 'Game arcade', id: '-gamemenu' },
      { title: '🎓 EDUCATION', description: 'Education tools', id: '-edumenu' },
      { title: '🇵🇰 PAKISTAN', description: 'Pakistan utilities', id: '-pkmenu' },
      { title: '🔧 TOOLS', description: 'Utility commands', id: '-menu' },
    ],
  },
];

function build() {
  return buildNativeFlowContent({
    title: 'ABIX-AE',
    body: 'Select a category to continue.',
    footer: 'Category Selector',
    buttons: [makeSingleSelect('📂 SELECT CATEGORY', sections)],
  });
}

module.exports = { name: 'category_selector', sections, build };
