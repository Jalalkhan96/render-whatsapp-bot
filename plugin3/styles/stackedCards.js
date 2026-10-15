'use strict';
const { makeQuickReply, buildNativeFlowContent } = require('../nativeFlow');

const ITEMS = [
  ['.dino', 'Dino Runner (easy / medium / hard)'],
  ['.trivia math hard', 'Trivia Pulse'],
  ['.wyr', 'Would You Rather'],
  ['.rps', 'Rock Paper Scissors'],
  ['.math', 'Speed Math'],
  ['.snake', 'Snake'],
  ['.hangman', 'Hangman'],
];

function build() {
  return buildNativeFlowContent({
    title: 'GAME ARCADE',
    body: 'Send a command to open a playable card.',
    footer: '© ABIX-AE',
    buttons: ITEMS.map(([id, label]) => makeQuickReply(`${id} — ${label}`, id)),
  });
}

module.exports = { name: 'stacked_cards', items: ITEMS, build };
