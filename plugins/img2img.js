const { MODELS, infer, imageInput } = require('../lib/huggingface');
module.exports = {
  command: 'img2img', aliases: ['image2image', 'imageedit'], category: 'ai',
  description: 'Edit an image with a prompt using Hugging Face', usage: '.img2img <prompt> (reply to image or give URL)',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prompt = args.filter(value => !/^https?:\/\//i.test(value)).join(' ').trim() || 'improve this image';
    const url = args.find(value => /^https?:\/\//i.test(value));
    try { const input = await imageInput(message, url); if (!input) return sock.sendMessage(chatId, { text: '❌ Image reply karein ya image URL dein. Example: .img2img cinematic style' }, { quoted: message }); const result = await infer(MODELS.imageImage, input, { prompt }); return sock.sendMessage(chatId, { image: result.buffer, caption: `🖼️ *Image → Image/Edit*\n${prompt}` }, { quoted: message }); }
    catch (error) { return sock.sendMessage(chatId, { text: `❌ HF Image Edit: ${error.message}` }, { quoted: message }); }
  }
};
