const {
    getBannedUsers,
    saveBannedUsers,
    isBanned,
    HAS_DB,
} = require('../lib/banStore');

module.exports = {
    command: 'ban',
    aliases: ['block', 'banuser'],
    category: 'group',
    description: 'Ban a user from using the bot',
    usage: '.ban @user or reply to message',
    groupOnly: true,
    adminOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};
        const isGroup = context.isGroup;

        let userToBan;
        if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            userToBan = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }
        else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToBan = message.message.extendedTextMessage.contextInfo.participant;
        }
        
        if (!userToBan) {
            await sock.sendMessage(chatId, { 
                text: '❌ *Please mention a user or reply to their message*\n\nUsage: `.ban @user` or reply with `.ban`',
                ...channelInfo 
            }, { quoted: message });
            return;
        }

        // Resolve current group membership when this is a group command.
        // The command is intentionally protected from banning the bot itself
        // or any group administrator.
        if (!isGroup) {
            await sock.sendMessage(chatId, {
                text: '❌ *This command can only be used in a group.*',
                ...channelInfo
            }, { quoted: message });
            return;
        }

        const normalizeIdentity = (value) => String(value || '')
            .trim()
            .toLowerCase()
            .split(':')[0];

        const identityVariants = (value) => {
            const raw = normalizeIdentity(value);
            if (!raw) return [];
            const bare = raw.includes('@') ? raw.split('@')[0] : raw;
            return [raw, bare];
        };

        const sameIdentity = (left, right) => {
            const a = identityVariants(left);
            const b = identityVariants(right);
            return a.length > 0 && b.length > 0 && a.some(v => b.includes(v));
        };

        try {
            const metadata = await sock.groupMetadata(chatId);
            const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];

            const botIdentities = [
                sock.user?.id,
                sock.user?.lid,
                sock.user?.jid,
                sock.user?.phoneNumber,
            ].filter(Boolean);

            const targetParticipant = participants.find(participant =>
                [participant?.id, participant?.lid, participant?.phoneNumber]
                    .filter(Boolean)
                    .some(identity => sameIdentity(identity, userToBan))
            );

            const isBotTarget = botIdentities.some(identity => sameIdentity(identity, userToBan));
            const isAdminTarget = Boolean(
                targetParticipant && ['admin', 'superadmin'].includes(targetParticipant.admin)
            );

            if (isBotTarget) {
                await sock.sendMessage(chatId, {
                    text: '❌ *I cannot ban myself.* 🤖',
                    ...channelInfo
                }, { quoted: message });
                return;
            }

            if (isAdminTarget) {
                await sock.sendMessage(chatId, {
                    text: '❌ *Group admins cannot be banned.* 👑',
                    ...channelInfo
                }, { quoted: message });
                return;
            }
        } catch (error) {
            console.error('Error resolving ban target:', error);
            await sock.sendMessage(chatId, {
                text: '❌ *Could not verify the target in this group.* Please try again.',
                ...channelInfo
            }, { quoted: message });
            return;
        }

        try {
            let bannedUsers = await getBannedUsers();
            
            if (!(await isBanned(userToBan))) {
                bannedUsers.push(userToBan);
                await saveBannedUsers(bannedUsers);
                
                await sock.sendMessage(chatId, { 
                    text: `🚫 *User Banned Successfully!*\n\n@${userToBan.split('@')[0]} has been banned from using the bot.\n\n` +
                          `*Storage:* ${HAS_DB ? 'Database' : 'File System'}`,
                    mentions: [userToBan],
                    ...channelInfo 
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { 
                    text: `⚠️ *Already Banned*\n\n@${userToBan.split('@')[0]} is already banned!`,
                    mentions: [userToBan],
                    ...channelInfo 
                }, { quoted: message });
            }
        } catch (error) {
            console.error('Error in ban command:', error);
            await sock.sendMessage(chatId, { 
                text: '❌ *Failed to ban user!*\n\nPlease try again.',
                ...channelInfo 
            }, { quoted: message });
        }
    }
};

module.exports.getBannedUsers = getBannedUsers;
module.exports.saveBannedUsers = saveBannedUsers;
module.exports.isUserBanned = isBanned;
