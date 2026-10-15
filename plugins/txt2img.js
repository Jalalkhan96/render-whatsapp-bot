const { MODELS, infer } = require('../lib/huggingface');
module.exports = {
  command: 'txt2img', aliases: ['text2image', 'texttoimage'], category: 'ai',
  description: 'Generate an image from text with Hugging Face', usage: '.txt2img <prompt>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prompt = args.join(' ').trim();
    if (!prompt) return sock.sendMessage(chatId, { text: '❌ Prompt dein. Example: .txt2img a neon Free Fire warrior' }, { quoted: message });
    try { const result = await infer(MODELS.textImage, prompt); return sock.sendMessage(chatId, { image: result.buffer, caption: `🎨 *Text → Image*\n${prompt}` }, { quoted: message }); }
    catch (error) { return sock.sendMessage(chatId, { text: `❌ HF Text → Image: ${error.message}` }, { quoted: message }); }
  }
};
