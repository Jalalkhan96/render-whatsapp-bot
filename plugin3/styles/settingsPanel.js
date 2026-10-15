'use strict';
const { makeQuickReply, buildNativeFlowContent } = require('../nativeFlow');

const ITEMS = [
  ['🛡️ AntiLink', 'settings:antilink'],
  ['🚫 AntiSpam', 'settings:antispam'],
  ['👥 Welcome', 'settings:welcome'],
  ['🔇 Auto Mute', 'settings:mute'],
  ['🤖 Chatbot', 'settings:chatbot'],
  ['📛 Badword Filter', 'settings:badword'],
];

function build() {
  return buildNativeFlowContent({
    title: 'SETTINGS',
    body: 'Choose a group setting to configure.',
    footer: 'ABIX-AE Settings',
    buttons: ITEMS.map(([label, id]) => makeQuickReply(label, id)),
  });
}

module.exports = { name: 'settings_panel', items: ITEMS, build };
