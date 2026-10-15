const { MODELS, infer, imageInput } = require('../lib/huggingface');
module.exports = {
  command: 'img2video', aliases: ['image2video', 'imagetovideo'], category: 'ai',
  description: 'Animate an image into a video with Hugging Face', usage: '.img2video <motion prompt> (reply to image or URL)', cooldown: 15000,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prompt = args.filter(value => !/^https?:\/\//i.test(value)).join(' ').trim() || 'smooth cinematic movement';
    const url = args.find(value => /^https?:\/\//i.test(value));
    try { const input = await imageInput(message, url); if (!input) return sock.sendMessage(chatId, { text: '❌ Image reply karein ya image URL dein. Example: .img2video slow camera movement' }, { quoted: message }); await sock.sendMessage(chatId, { text: '⏳ Image animation start ho gayi. Thora wait karein...' }, { quoted: message }); const result = await infer(MODELS.imageVideo, input, { prompt }); return sock.sendMessage(chatId, { video: result.buffer, caption: `🎞️ *Image → Video*\n${prompt}` }, { quoted: message }); }
    catch (error) { return sock.sendMessage(chatId, { text: `❌ HF Image → Video: ${error.message}` }, { quoted: message }); }
  }
};
