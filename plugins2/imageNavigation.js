const image = require('./image');

module.exports = ['image-next', 'image-prev', 'image-cancel'].map(command => ({
  command,
  category: 'download',
  description: `Image search ${command.replace('image-', '')}`,
  usage: `.${command}`,
  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const senderId = context.senderId || message.key.participant || chatId;
    await image.handleNavigation(sock, message, chatId, senderId, command);
  }
}));
