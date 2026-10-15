'use strict';
const { sendDedicatedHtmlGame } = require('../lib/dedicatedHtmlGame.cjs');

module.exports = {
  command: 'snake',
  aliases: ['snakegame'],
  category: 'utility',
  description: 'Play Snake as a native HTML game inside supported WhatsApp clients',
  async handler(sock, message) {
    return sendDedicatedHtmlGame(sock, message, 'snake');
  },
};
