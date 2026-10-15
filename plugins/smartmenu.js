const CommandHandler = require('../lib/commandHandler');
const settings = require("../settings");
const { buildBotTopMessage } = require('../lib/menuMedia');

const menuEmojis = ['✨', '🌟', '⭐', '💫', '🎯', '🎨', '🎪', '🎭'];
const activeEmojis = ['✅', '🟢', '💚', '✔️', '☑️'];
const disabledEmojis = ['❌', '🔴', '⛔', '🚫', '❎'];
const fastEmojis = ['⚡', '🚀', '💨', '⏱️', '🔥'];
const slowEmojis = ['🐢', '🐌', '⏳', '⌛', '🕐'];
const categoryEmojis = {
    general: ['📱', '🔧', '⚙️', '🛠️'],
    owner: ['👑', '🔱', '💎', '🎖️'],
    admin: ['🛡️', '⚔️', '🔐', '👮'],
    group: ['👥', '👫', '🧑‍🤝‍🧑', '👨‍👩‍👧‍👦'],
    download: ['📥', '⬇️', '💾', '📦'],
    ai: ['🤖', '🧠', '💭', '🎯'],
    search: ['🔍', '🔎', '🕵️', '📡'],
    apks: ['📲', '📦', '💿', '🗂️'],
    info: ['ℹ️', '📋', '📊', '📄'],
    fun: ['🎮', '🎲', '🎰', '🎪'],
    stalk: ['👀', '🔭', '🕵️', '🎯'],
    games: ['🎮', '🕹️', '🎯', '🏆'],
    images: ['🖼️', '📸', '🎨', '🌄'],
    menu: ['📜', '📋', '📑', '📚'],
    tools: ['🔨', '🔧', '⚡', '🛠️'],
    stickers: ['🎭', '😀', '🎨', '🖼️'],
    quotes: ['💬', '📖', '✍️', '💭'],
    music: ['🎵', '🎶', '🎧', '🎤'],
    utility: ['📂', '🔧', '⚙️', '🛠️']
};

function getRandomEmoji(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getCategoryEmoji(category) {
    const emojis = categoryEmojis[category.toLowerCase()] || ['📂', '📁', '🗂️', '📋'];
    return getRandomEmoji(emojis);
}

function formatDateTime() {
    const now = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: settings.timeZone || 'Asia/Karachi' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: settings.timeZone || 'Asia/Karachi' };
    return {
        date: now.toLocaleDateString('en-PK', dateOptions),
        time: now.toLocaleTimeString('en-PK', timeOptions)
    };
}

module.exports = {
  command: 'smenu',
  aliases: ['shelp', 'smart'],
  category: 'general',
  description: 'Interactive smart menu with live status',
  usage: `${settings.prefixes[0]}smenu`,
  isPrefixless: true,

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || settings.prefixes[0] || '-';

    try {
      const categories = Array.from(CommandHandler.categories.keys());
      const stats = CommandHandler.getDiagnostics();
      
      const menuEmoji = getRandomEmoji(menuEmojis);
      
      const activeEmoji = getRandomEmoji(activeEmojis);
      const disabledEmoji = getRandomEmoji(disabledEmojis);
      const fastEmoji = getRandomEmoji(fastEmojis);
      const slowEmoji = getRandomEmoji(slowEmojis);
      
      const dt = formatDateTime();

      let menuText = `${menuEmoji} *${settings.botName || 'ABIX AE'}* ${menuEmoji}\n\n`;
      menuText += `╭───「 *BOT INFO* 」\n`;
      menuText += `│ 📱 *Bot:* ${settings.botName || 'ABIX'}\n`;
      menuText += `│ 👤 *Owner:* ${settings.botOwner || 'ABIX'}\n`;
      menuText += `│ 📅 *Date:* ${dt.date}\n`;
      menuText += `│ ⏰ *Time:* ${dt.time}\n`;
      menuText += `│ ℹ️ *Prefix:* ${settings.prefixes ? settings.prefixes.join(', ') : '.'}\n`;
      menuText += `│ 📊 *Plugins:* ${CommandHandler.commands.size}\n`;
      menuText += `╰───────────────○\n\n`;

      const topCmds = stats.slice(0, 3).filter(s => s.usage > 0);
      if (topCmds.length > 0) {
        menuText += `🔥 *TOP COMMANDS:*\n`;
        topCmds.forEach((c, i) => {
          const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
          menuText += `${rank} ${settings.prefixes[0] || '-'}${c.command} • ${c.usage} uses\n`;
        });
        menuText += `\n`;
      }

      for (const cat of categories) {
        const catEmoji = getCategoryEmoji(cat);
        menuText += `${catEmoji} *${cat.toUpperCase()}*\n`;
        menuText += `┌─────────────────\n`;
        
        const catCmds = CommandHandler.getCommandsByCategory(cat);
        
        catCmds.forEach((cmdName, index) => {
          const isLast = index === catCmds.length - 1;
          const branch = isLast ? '└' : '├';
          
          const isOff = CommandHandler.disabledCommands.has(cmdName.toLowerCase());
          const cmdStats = stats.find(s => s.command === cmdName.toLowerCase());
          
          const statusIcon = isOff ? disabledEmoji : activeEmoji;
          
          let speedTag = '';
          if (cmdStats && !isOff) {
            const ms = parseFloat(cmdStats.average_speed);
            if (ms > 0 && ms < 100) speedTag = ` ${fastEmoji}`;
            else if (ms > 1000) speedTag = ` ${slowEmoji}`;
          }
          
          menuText += `${branch}─ ${statusIcon} ${prefix}${cmdName}${speedTag}\n`;
        });
        menuText += `\n`;
      }

      menuText += `┌────────────────\n`;
      menuText += `├  💡 *LEGEND*\n`;
      menuText += `├─ ${activeEmoji} Active Command\n`;
      menuText += `├─ ${disabledEmoji} Disabled Command\n`;
      menuText += `├─ ${fastEmoji} Fast Response\n`;
      menuText += `├─ ${slowEmoji} Slow Response\n`;
      menuText += `⁠└────────────────`;

      const messageOptions = buildBotTopMessage(menuText, { _skipMenuCard: true });
      await sock.sendMessage(chatId, messageOptions, { quoted: message });

    } catch (error) {
      console.error('Menu Error:', error);
      await sock.sendMessage(chatId, { 
        text: `❌ *Menu Error*\n\n${error.message}`
      }, { quoted: message });
    }
  }
};
