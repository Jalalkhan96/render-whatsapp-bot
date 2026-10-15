const settings = require('../settings');
module.exports = {
  command: 'aimenu',
  aliases: ['huggingfacemenu', 'generatemenu'],
  category: 'ai',
  description: 'Shows Hugging Face image and video generation commands',
  usage: `${settings.prefixes[0]}aimenu`,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';
    const text = `╭━━━〔 🤗 *HUGGING FACE AI* 〕━━━╮
┃ Free/serverless AI generation tools
╰━━━━━━━━━━━━━━━━━━━━╯

🎨 ${prefix}txt2img <prompt> - Text → Image
🖼️ ${prefix}img2img <prompt> - Image → Image/Edit
🎬 ${prefix}txt2video <prompt> - Text → Video
🎞️ ${prefix}img2video <prompt> - Image → Video

📌 Image commands: image reply karein ya URL dein.
🔐 Setup: HF_TOKEN environment variable required.
⚠️ Free models cold-start/rate-limit ki wajah se slow ho sakte hain.`;
    return sock.sendMessage(chatId, { text }, { quoted: message });
  }
};
