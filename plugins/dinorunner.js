'use strict';
const { sendDedicatedHtmlGame } = require('../lib/dedicatedHtmlGame.cjs');

module.exports = {
  command: 'dinorunner',
  aliases: ['dinorun'],
  category: 'game',
  description: 'Play Dino Runner as a native HTML game inside supported WhatsApp clients',
  usage: '-dinorunner',
  async handler(sock, message) {
    return sendDedicatedHtmlGame(sock, message, 'dino');
  },
};
