const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const { sendInteractiveCarousel } = require('../lib/interactiveMenu');

module.exports = {
  command: 'funmenu',
  aliases: ['fun', 'gamesmenu', 'mememenu'],
  category: 'general',
  description: 'Shows all fun, games, and meme commands',
  usage: `${settings.prefixes[0]}funmenu`,
  
  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';

    let menuText = `╭───「 🎭 *FUN MENU* 」\n`;
    menuText += `│ Yahan aapke liye memes, stickers aur fun commands hain:\n`;
    menuText += `╰───────────────○\n\n`;

    menuText += `*😂 Memes & Sounds*\n`;
    menuText += `└ ⚡ \`${prefix}gmeme\` (Search or random meme)\n`;
    menuText += `└ ⚡ \`${prefix}memesound <name>\`\n`;
    menuText += `└ ⚡ \`${prefix}meme\`\n`;
    menuText += `└ ⚡ \`${prefix}joke\`\n`;
    menuText += `└ ⚡ \`${prefix}chuck\` (Chuck Norris jokes)\n\n`;

    menuText += `*🎨 Stickers & Media*\n`;
    menuText += `└ ⚡ \`${prefix}sticker\` (Image to sticker)\n`;
    menuText += `└ ⚡ \`${prefix}sticker2gif\`\n`;
    menuText += `└ ⚡ \`${prefix}tgpack <url>\` (Telegram stickers)\n`;
    menuText += `└ ⚡ \`${prefix}memepack\`\n\n`;

    menuText += `*🎭 Anime Reactions*\n`;
    menuText += `└ ⚡ \`${prefix}anmereaction\` (Anime reactions menu)\n`;
    menuText += `└ ⚡ \`${prefix}reaction\` (Random animated reaction sticker)\n`;
    menuText += `└ ⚡ \`${prefix}reactionlist\` (All reaction categories)\n`;
    menuText += `└ ⚡ \`${prefix}kiss\` | \`${prefix}hug\` | \`${prefix}slap\`\n`;
    menuText += `└ ⚡ \`${prefix}pat\` | \`${prefix}bonk\` | \`${prefix}cuddle\`\n\n`;

    menuText += `*💡 Advice & Motivation*\n`;
    menuText += `└ ⚡ \`${prefix}adviceslip\` — Random advice\n`;
    menuText += `└ ⚡ \`${prefix}dailyadvice\` | \`${prefix}lifeadvice\`\n`;
    menuText += `└ ⚡ \`${prefix}studyadvice\` — Study motivation\n\n`;

    menuText += `*🎮 Games & Fun*\n`;
    menuText += `└ ⚡ \`${prefix}truth\`\n`;
    menuText += `└ ⚡ \`${prefix}dare\`\n`;
    menuText += `└ ⚡ \`${prefix}chess\`\n`;
    menuText += `└ ⚡ \`${prefix}trivia\`\n\n`;
    
    menuText += `*🐶 Anime & Animals*\n`;
    menuText += `└ ⚡ \`${prefix}dog\`\n`;
    menuText += `└ ⚡ \`${prefix}cat\`\n`;
    menuText += `└ ⚡ \`${prefix}fox\`\n`;
    menuText += `└ ⚡ \`${prefix}cuddle\`\n`;
    menuText += `└ ⚡ \`${prefix}slap\`\n`;
    menuText += `└ ⚡ \`${prefix}bonk\`\n\n`;

    menuText += `✨ *Powered by ABIX-AE*`;

    await sock.sendMessage(chatId, { text: menuText, _skipMenuCard: true }, { quoted: message });
  }
};
