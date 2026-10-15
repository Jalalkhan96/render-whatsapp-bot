const gemini = require('../lib/geminiService');

module.exports = {
  command: 'gemini',
  aliases: ['gem'],
  category: 'ai',
  description: 'Ask Gemini using the official Google Gemini API',
  usage: '.gemini <question>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const query = (args || []).join(' ').trim();

    if (!query) {
      return sock.sendMessage(
        chatId,
        {
          text: [
            '🤖 *GEMINI AI*',
            '',
            'Ask Gemini anything.',
            '',
            'Usage:',
            `${context.prefix || '-'}gemini <question>`,
            '',
            'Example:',
            `${context.prefix || '-'}gemini explain recursion in JavaScript`,
          ].join('\n'),
        },
        { quoted: message }
      );
    }

    try {
      await sock.sendMessage(chatId, {
        react: { text: '🤖', key: message.key },
      });
    } catch {}

    try {
      const answer = await gemini.generateGemini(query);

      await sock.sendMessage(
        chatId,
        { text: answer },
        { quoted: message }
      );

      try {
        await sock.sendMessage(chatId, {
          react: { text: '✅', key: message.key },
        });
      } catch {}
    } catch (error) {
      console.error('[Gemini Command]', error?.code || error?.message || error);

      await sock.sendMessage(
        chatId,
        {
          text: gemini.friendlyErrorMessage(error?.code),
        },
        { quoted: message }
      );

      try {
        await sock.sendMessage(chatId, {
          react: { text: '❌', key: message.key },
        });
      } catch {}
    }
  },
};
