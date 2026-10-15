'use strict';
const { sendDedicatedHtmlGame } = require('../lib/dedicatedHtmlGame.cjs');

module.exports = {
  command: 'flappy',
  aliases: ['flappybird', 'flap'],
  category: 'utility',
  description: 'Play Flappy Bird as a native HTML game inside supported WhatsApp clients',
  async handler(sock, message) {
    return sendDedicatedHtmlGame(sock, message, 'flappy');
  },
};
