const abix = require('./abix');
const { isOwnerOnlyAsync } = require('../lib/isOwner');

module.exports = {
  command: 'abixadmin',
  aliases: ['abixadministrator'],
  category: 'owner',
  strictOwnerOnly: true,
  ownerOnly: true,
  hiddenFromMenu: true,
  description: 'Owner-only ABIX maintenance and file administration',
  usage: '-abixadmin <help|add|remove|update|reload|renew|...>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const senderId = context.senderId || message.key.participant || chatId;
    if (!(context?.isPrimaryOwner || await isOwnerOnlyAsync(senderId, sock, chatId))) {
      return sock.sendMessage(chatId, {
        text: '❌ This command is restricted to the configured bot owner.',
      }, { quoted: message });
    }

    const forwarded = [...(args || [])];
    const action = String(forwarded[0] || 'help').toLowerCase();
    if (action === 'help') {
      const prefix = context.prefix || '-';
      return sock.sendMessage(chatId, { text: [
        '🛡️ ABIX OWNER FILE MANAGER',
        `${prefix}abixadmin ls [path]  •  ${prefix}abixadmin tree`,
        `${prefix}abixadmin read <file>  •  ${prefix}abixadmin stat <file>  •  ${prefix}abixadmin find <query>`,
        `${prefix}abixadmin write <file> <text>  •  ${prefix}abixadmin append <file> <text>  •  ${prefix}abixadmin update <file> <text>`,
        `${prefix}abixadmin rename <old> <new>  •  ${prefix}abixadmin delete <file>  •  ${prefix}abixadmin mkdir <dir>  •  ${prefix}abixadmin rmdir <dir>`,
        `${prefix}abixadmin download <file>  •  ${prefix}abixadmin upload <path> (reply to media/file)`,
        `${prefix}abixadmin status  •  ${prefix}abixadmin gemini  •  ${prefix}abixadmin reload  •  ${prefix}abixadmin restart`,
        `Destructive actions require: ${prefix}abixadmin confirm <code>`,
      ].join('\n') }, { quoted: message });
    }
    if (action === 'add') forwarded[0] = 'write';
    if (action === 'remove') forwarded[0] = 'delete';
    if (action === 'renew') forwarded[0] = 'reload';

    return abix.handler(sock, message, forwarded, {
      ...context,
      isPrimaryOwner: true,
      isOwnerOnly: true,
    });
  },
};
