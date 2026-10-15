const { MODELS, infer } = require('../lib/huggingface');

module.exports = {
  command: 'txt2video',
  aliases: ['text2video', 'texttovideo'],
  category: 'ai',
  description: 'AI Text to Video Generator',
  usage: '.txt2video <prompt>',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const text = args.join(' ').trim();
    
    if (!text) {
      return await sock.sendMessage(chatId, { text: '❌ Prompt dein. Example: .txt2video a racing car in neon rain' }, { quoted: message });
    }

    await sock.sendMessage(chatId, { text: '⏳ Hugging Face video generation start ho gayi. Thora wait karein...' }, { quoted: message });

    try {
      const result = await infer(MODELS.textVideo, text);
      const caption = `🎬 *TEXT → VIDEO*\n\n📝 ${text}\n📡 Source: Hugging Face`;

      await sock.sendMessage(chatId, {
        video: result.buffer,
        caption,
        mimetype: "video/mp4"
      }, { quoted: message });

    } catch (e) {
      console.log('TXT2VIDEO ERROR:', e.message);
      await sock.sendMessage(chatId, { text: `❌ *HF TEXT → VIDEO FAILED*\n\n${e.message}` }, { quoted: message });
    }
  }
};
