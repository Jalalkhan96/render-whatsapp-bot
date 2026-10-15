const {
    getBannedUsers,
    removeBannedUser,
    HAS_DB,
} = require('../lib/banStore');

module.exports = {
  command: 'unban',
  aliases: ['pardon'],
  category: 'admin',
  description: 'Unban a user from using the bot',
  usage: '.unban [@user] or reply to message',
  ownerOnly: false,
  
  async handler(sock, message, args, context) {
    const { chatId, senderId, isGroup, channelInfo, isOwner, isSenderAdmin, isBotAdmin } = context;
    
    if (isGroup) {
      if (!isBotAdmin) {
        await sock.sendMessage(chatId, { 
          text: 'Please make the bot an admin to use .unban', 
          ...channelInfo 
        }, { quoted: message });
        return;
      }
      if (!isSenderAdmin && !isOwner) {
        await sock.sendMessage(chatId, { 
          text: 'Only group admins can use .unban', 
          ...channelInfo 
        }, { quoted: message });
        return;
      }
    } else {
      if (!isOwner) {
        await sock.sendMessage(chatId, { 
          text: 'Only owner can use .unban in private chat', 
          ...channelInfo 
        }, { quoted: message });
        return;
      }
    }
    
    let userToUnban;
    
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
      userToUnban = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
      userToUnban = message.message.extendedTextMessage.contextInfo.participant;
    }
    
    if (!userToUnban) {
      await sock.sendMessage(chatId, { 
        text: 'Please mention the user or reply to their message to unban!', 
        ...channelInfo 
      }, { quoted: message });
      return;
    }

    try {
      const result = await removeBannedUser(userToUnban);

      if (result.removed) {
        
        await sock.sendMessage(chatId, { 
          text: `✅ Successfully unbanned @${userToUnban.split('@')[0]}!\n\nStorage: ${HAS_DB ? 'Database' : 'File System'}`,
          mentions: [userToUnban],
          ...channelInfo 
        }, { quoted: message });
      } else {
        await sock.sendMessage(chatId, { 
          text: `@${userToUnban.split('@')[0]} is not banned!`,
          mentions: [userToUnban],
          ...channelInfo 
        }, { quoted: message });
      }
    } catch (error) {
      console.error('Error in unban command:', error);
      await sock.sendMessage(chatId, { 
        text: 'Failed to unban user!', 
        ...channelInfo 
      }, { quoted: message });
    }
  }
};
