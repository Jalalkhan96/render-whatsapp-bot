const gemini = require('../lib/geminiService');

module.exports = {
  command: 'gpt',
  aliases: ['ai', 'chat'],
  category: 'ai',
  description: 'Ask a question through the configured Gemini service',
  usage: '.gpt <question> or .ai <question>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const query = (args || []).join(' ').trim();

    if (!query) {
      return sock.sendMessage(chatId, {
        text: 'Please provide a query after .gpt or .ai\n\nExample: .gpt write a basic HTML code'
      }, { quoted: message });
    }

    try {
      await sock.sendMessage(chatId, {
        react: { text: '🤖', key: message.key }
      });

      const answer = await gemini.generateGemini(query);

      await sock.sendMessage(
        chatId,
        { text: answer },
        { quoted: message }
      );
    } catch (error) {
      console.error('[GPT Command]', error?.code || error?.message || error);
      await sock.sendMessage(chatId, {
        text: gemini.friendlyErrorMessage(error?.code),
      }, { quoted: message });
    }
  }
};
