const fs = require('fs');
const path = require('path');
const isOwner = require('../lib/isOwner');

const channelInfo = {
  contextInfo: {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363319098372999@newsletter',
      newsletterName: 'ABIX-AE',
      serverMessageId: -1
    }
  }
};

module.exports = {
  command: 'clearsession',
  aliases: ['clearses', 'csession'],
  category: 'owner',
  description: 'Clear session files',
  usage: '.clearsession',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    try {
      const senderId = message.key.participant || message.key.remoteJid;
      const isOwner = await isOwner(senderId, sock, chatId);

      if (!isOwner) {
        return await sock.sendMessage(chatId, { text: '*This command can only be used by the owner!*', ...channelInfo });
      }

      const sessionDir = path.resolve(process.env.SESSION_DIR || path.join(__dirname, '../session'));
      if (!fs.existsSync(sessionDir)) {
        return await sock.sendMessage(chatId, { text: '*Session directory not found!*', ...channelInfo });
      }

      let filesCleared = 0;
      let errors = 0;
      let errorDetails = [];

      await sock.sendMessage(chatId, { text: '🔍 Optimizing session files for better performance...', ...channelInfo });

      const files = fs.readdirSync(sessionDir);
      let appStateSyncCount = 0;
      let preKeyCount = 0;

      for (const file of files) {
        if (file.startsWith('app-state-sync-')) appStateSyncCount++;
        if (file.startsWith('pre-key-')) preKeyCount++;
      }

      for (const file of files) {
        if (file === 'creds.json') continue;
        try {
          fs.unlinkSync(path.join(sessionDir, file));
          filesCleared++;
        } catch (err) {
          errors++;
          errorDetails.push(`Failed to delete ${file}: ${err.message}`);
        }
      }

      const msgText = `✅ Session files cleared successfully!\n\n` +
                      `📊 Statistics:\n` +
                      `• Total files cleared: ${filesCleared}\n` +
                      `• App state sync files: ${appStateSyncCount}\n` +
                      `• Pre-key files: ${preKeyCount}\n` +
                      (errors > 0 ? `\n⚠️ Errors encountered: ${errors}\n${errorDetails.join('\n')}` : '');

      await sock.sendMessage(chatId, { text: msgText, ...channelInfo });

    } catch {
      await sock.sendMessage(chatId, { text: '❌ Failed to clear session files!', ...channelInfo });
    }
  }
};
