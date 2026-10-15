const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const { sendInteractiveCarousel } = require('../lib/interactiveMenu');

module.exports = {
  command: 'edumenu',
  aliases: ['education', 'edu'],
  category: 'general',
  description: 'Shows education and utility API commands',
  usage: `${settings.prefixes[0]}edumenu`,
  
  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';

    let menuText = `╭───「 🎓 *EDUCATION MENU* 」\n`;
    menuText += `│ Yahan knowledge aur utility APIs hain:\n`;
    menuText += `╰───────────────○\n\n`;

    menuText += `*📚 Dictionary & Info*\n`;
    menuText += `└ ⚡ \`${prefix}dictionary <word>\`\n`;
    menuText += `└ ⚡ \`${prefix}wikipedia <query>\`\n`;
    menuText += `└ ⚡ \`${prefix}country <name>\`\n`;
    menuText += `└ ⚡ \`${prefix}university <country>\`\n\n`;

    menuText += `*🔢 Math & Science*\n`;
    menuText += `└ ⚡ \`${prefix}math <expr>\`\n`;
    menuText += `└ ⚡ \`${prefix}nasa\`\n`;
    menuText += `└ ⚡ \`${prefix}mathfact <number>\`\n`;
    menuText += `└ ⚡ \`${prefix}calculator [value]\` (In-built math)\n\n`;

    menuText += `*💡 Knowledge & Fun*\n`;
    menuText += `└ ⚡ \`${prefix}quote\` — Motivational quote\n`;
    menuText += `└ ⚡ \`${prefix}riddle\` — Paheli + answer\n`;
    menuText += `└ ⚡ \`${prefix}fact\` — Amazing fact\n`;
    menuText += `└ ⚡ \`${prefix}flashcard\` — Random study card\n`;
    menuText += `└ ⚡ \`${prefix}news <source>\` — Pakistan & world news\n`;
    menuText += `└ ⚡ \`${prefix}newsmenu\` — all sources\n\n`;

    menuText += `*📚 Study Tools*\n`;
    menuText += `└ ⚡ \`${prefix}studymenu\` — Study & exam tools\n`;
    menuText += `└ ⚡ \`${prefix}ask <question>\` — Study assistant\n`;
    menuText += `└ ⚡ \`${prefix}explain <topic>\` — Easy explanation\n`;
    menuText += `└ ⚡ \`${prefix}quiz <topic>\` — Practice quiz\n`;
    menuText += `└ ⚡ \`${prefix}mcq <topic>\` — MCQs\n`;
    menuText += `└ ⚡ \`${prefix}studyplan <subject> <days>\` — Study plan\n`;
    menuText += `└ ⚡ \`${prefix}notes <topic>\` — Study notes\n\n`;

    menuText += `*🛠️ Utility & Conversions*\n`;
    menuText += `└ ⚡ \`${prefix}html2pdf <url>\`\n`;
    menuText += `└ ⚡ \`${prefix}img2pdf\` (Reply to image)\n`;
    menuText += `└ ⚡ \`${prefix}currency <USD>\`\n`;
    menuText += `└ ⚡ \`${prefix}weather <city>\`\n`;
    menuText += `└ ⚡ \`${prefix}qr <text>\`\n`;
    menuText += `└ ⚡ \`${prefix}shorturl <url>\`\n`;
    menuText += `└ ⚡ \`${prefix}password\`\n\n`;

    menuText += `*🛡️ Security Tools*\n`;
    menuText += `└ ⚡ \`${prefix}secmenu\` — IP, hash, password tools\n\n`;

    menuText += `✨ *Powered by ABIX-AE*`;

    await sock.sendMessage(chatId, { text: menuText, _skipMenuCard: true }, { quoted: message });
  }
};
