const settings = require('../settings');
module.exports = {
  command: 'voicemenu',
  aliases: ['langmenu', 'speechmenu', 'vm'],
  category: 'general',
  description: 'Shows all Language, Speech & Translation commands',
  usage: `${settings.prefixes[0]}voicemenu`,

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';

    let menuText = `╭───「 🎙️ *VOICE & LANGUAGE MENU* 」\n`;
    menuText += `│ Speech, Translation & Language tools:\n`;
    menuText += `╰───────────────○\n\n`;

    menuText += `*🎙️ Voice To Text (STT)*\n`;
    menuText += `└ ⚡ \`${prefix}stt\` ─ Reply to voice note to transcribe\n`;
    menuText += `└ 📌 Aliases: \`${prefix}voicetotext\`, \`${prefix}v2t\`, \`${prefix}transcribe\`\n\n`;

    menuText += `*🔊 Text To Speech (TTS)*\n`;
    menuText += `└ ⚡ \`${prefix}tts [text]\` ─ Convert text to voice note\n`;
    menuText += `└ 📌 Example: \`${prefix}tts Hello World\`\n\n`;

    menuText += `*🌍 Translate*\n`;
    menuText += `└ ⚡ \`${prefix}translate [lang] [text]\`\n`;
    menuText += `└ ⚡ Or reply to msg: \`${prefix}translate [lang]\`\n`;
    menuText += `└ 📌 Example: \`${prefix}translate ur Hello World\`\n\n`;

    menuText += `*📋 Common Language Codes:*\n`;
    menuText += `🇵🇰 \`ur\` Urdu  |  🇺🇸 \`en\` English\n`;
    menuText += `🇸🇦 \`ar\` Arabic  |  🇮🇳 \`hi\` Hindi\n`;
    menuText += `🇪🇸 \`es\` Spanish  |  🇫🇷 \`fr\` French\n`;
    menuText += `🇩🇪 \`de\` German  |  🇹🇷 \`tr\` Turkish\n`;
    menuText += `🇷🇺 \`ru\` Russian  |  🇨🇳 \`zh\` Chinese\n\n`;

    await sock.sendMessage(chatId, {
      text: menuText,
      contextInfo: {}
    }, { quoted: message });
  }
};
