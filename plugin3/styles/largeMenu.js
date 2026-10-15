'use strict';
const { makeSingleSelect, buildNativeFlowContent } = require('../nativeFlow');

const rows = [
  ['📐 Mathematics', 'Programming and math tools', '-mathmenu'],
  ['💻 Programming', 'Coding utilities', '-codemenu'],
  ['🗄️ Database', 'Database utilities', '-dbmenu'],
  ['🌐 Web Development', 'Web tools', '-webmenu'],
  ['📖 General Education', 'Education utilities', '-edumenu'],
  ['🧠 Study Tools', 'Study helpers', '-studymenu'],
];

function build() {
  return buildNativeFlowContent({
    title: 'STUDY MENU',
    body: 'Select a section from this large menu.',
    footer: 'Single Select Demo',
    buttons: [
      makeSingleSelect('📚 SELECT SECTION', [
        {
          title: 'STUDY SECTIONS',
          rows: rows.map(([title, description, id]) => ({ title, description, id })),
        },
      ]),
    ],
  });
}

module.exports = { name: 'large_menu', rows, build };
