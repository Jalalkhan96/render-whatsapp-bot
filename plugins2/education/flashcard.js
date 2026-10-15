const { getChannelInfo } = require('../../lib/channelInfo');

const FAKE_FORWARD = getChannelInfo();

const CARDS = [
  ['What does HTTPS protect?', 'It encrypts data between your browser and the website.'],
  ['What is a CPU?', 'The Central Processing Unit executes program instructions.'],
  ['What is a prime number?', 'A number greater than 1 with exactly two positive divisors.'],
  ['What does RAM do?', 'It temporarily stores data used by running programs.'],
  ['Why should passwords be unique?', 'A breach in one service should not unlock your other accounts.'],
  ['What is photosynthesis?', 'Plants use light, water and carbon dioxide to make food and oxygen.']
];

module.exports = {
  command: 'flashcard',
  aliases: ['learn', 'quizcard', 'study'],
  category: 'education',
  description: 'Random educational flashcard',
  usage: '.flashcard',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const [question, answer] = CARDS[Math.floor(Math.random() * CARDS.length)];
    const text =
      `╭───「 🎓 *FLASHCARD* 」\n` +
      `╰───────────────○\n\n` +
      `❓ *Question:*\n${question}\n\n` +
      `💡 *Answer:*\n${answer}\n\n` +
      `🔁 \`.flashcard\` for another card`;

    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
  }
};
