const settings = require('../settings');
const { writeSettings } = require('../lib/settingsStore');

module.exports = {
  command: 'cooldown',
  aliases: ['cd', 'cmdcooldown'],
  category: 'owner',
  strictOwnerOnly: true,
  description: 'Owner-only command cooldown and global response delay control',
  usage: '-cooldown <command> <seconds> | -cooldown off <command> | -cooldown delay <seconds> | -cooldown list',
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    settings.commandCooldowns ||= {};
    const prefix = context.prefix || settings.prefixes?.[0] || '-';
    const action = String(args[0] || '').toLowerCase();
    const reply = (text) => sock.sendMessage(chatId, { text }, { quoted: message });

    if (!action) return reply(`⚙️ *COOLDOWN CONTROL*\n\n${prefix}cooldown ping 2\n${prefix}cooldown command 10\n${prefix}cooldown off ping\n${prefix}cooldown list\n${prefix}cooldown delay 1\n\nDelay: 0–30 seconds\nCommand cooldown: 0–86400 seconds`);

    if (action === 'list') {
      const rows = Object.entries(settings.commandCooldowns);
      return reply(`⚙️ *ACTIVE COOLDOWNS*\n\n${rows.length ? rows.map(([k,v]) => `• *${k}* → ${v}s`).join('\n') : 'No command-specific cooldowns are active.'}\n\n⏱️ Global response delay: *${Number(settings.responseDelay || 0)}s*`);
    }

    if (action === 'delay') {
      const seconds = Number(args[1]);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30) return reply('❌ Delay must be between 0 and 30 seconds.');
      settings.responseDelay = seconds;
      writeSettings(settings);
      return reply(`✅ *RESPONSE DELAY UPDATED*\n\n⏱️ ${seconds}s\nAll command responses will wait this long.`);
    }

    if (action === 'off') {
      const command = String(args[1] || '').toLowerCase();
      if (!command) return reply(`Usage: ${prefix}cooldown off <command>`);
      delete settings.commandCooldowns[command];
      writeSettings(settings);
      return reply(`✅ Cooldown disabled for *${command}*.`);
    }

    const seconds = Number(args[1]);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) return reply('❌ Command cooldown must be between 0 and 86400 seconds.');
    settings.commandCooldowns[action] = seconds;
    writeSettings(settings);
    return reply(`✅ Cooldown updated\n\nCommand: *${action}*\n⏱️ ${seconds}s\n👤 Per user: enabled`);
  }
};
