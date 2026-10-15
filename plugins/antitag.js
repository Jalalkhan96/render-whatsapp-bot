const { setAntitag, getAntitag, removeAntitag } = require('../lib/index');
const isOwner = require('../lib/isOwner');
const { ownerNumbers, cleanJid } = require('../lib/isOwner');
const warningCooldowns = new Map();
const WARNING_COOLDOWN_MS = Number(process.env.ANTITAG_WARNING_COOLDOWN_MS) || 5000;

async function handleTagDetection(sock, chatId, message, senderId) {
    try {
        const antitagSetting = await getAntitag(chatId, 'on');
        if (!antitagSetting || !antitagSetting.enabled) return;
        if (await isOwner(senderId, sock, chatId)) return;

        const mentionedJids = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        
        const uniqueMentionedJids = [...new Set(mentionedJids)];
        const totalMentions = uniqueMentionedJids.length;
        const ownerMentioned = uniqueMentionedJids.some(jid => ownerNumbers().includes(cleanJid(jid)));
        if (ownerMentioned) {
            const cooldownKey = `${chatId}:${cleanJid(senderId)}`;
            const now = Date.now();
            if ((warningCooldowns.get(cooldownKey) || 0) <= now) {
                warningCooldowns.set(cooldownKey, now + WARNING_COOLDOWN_MS);
                await sock.sendMessage(chatId, {
                    text: '🛡️ *Anti-Tag Protection*\n\nبراہِ کرم bot owner کو بار بار tag نہ کریں۔',
                }, { quoted: message });
            }
            if (process.env.ANTITAG_DELETE_MESSAGE === 'true') {
                try {
                    await sock.sendMessage(chatId, {
                        delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: senderId }
                    });
                } catch (error) {
                    console.warn('[ANTITAG] Could not delete owner mention:', error.message);
                }
            }
            return;
        }

        if (totalMentions >= 3) {
            const groupMetadata = await sock.groupMetadata(chatId);
            const participants = groupMetadata.participants || [];
            const mentionThreshold = Math.ceil(participants.length * 0.5);
            
            if (totalMentions >= mentionThreshold) {
                const action = antitagSetting.action || 'delete';
                
                if (action === 'delete') {
                    await sock.sendMessage(chatId, {
                        delete: {
                            remoteJid: chatId,
                            fromMe: false,
                            id: message.key.id,
                            participant: senderId
                        }
                    });
                    
                    await sock.sendMessage(chatId, {
                        text: `⚠️ *Tagall Detected!*\n\n@${senderId.split('@')[0]}, tagging all members is not allowed.`,
                        mentions: [senderId]
                    });
                    
                } else if (action === 'kick') {
                    await sock.sendMessage(chatId, {
                        delete: {
                            remoteJid: chatId,
                            fromMe: false,
                            id: message.key.id,
                            participant: senderId
                        }
                    });

                    try {
                        await sock.groupParticipantsUpdate(chatId, [senderId], "remove");
                        await sock.sendMessage(chatId, {
                            text: `🚫 *Antitag Action!*\n\n@${senderId.split('@')[0]} has been removed for tagging all members.`,
                            mentions: [senderId]
                        });
                    } catch (error) {
                        await sock.sendMessage(chatId, {
                            text: `⚠️ Failed to remove user. Make sure the bot is an admin.`
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in tag detection:', error);
    }
}

module.exports = {
    command: 'antitag',
    aliases: ['at', 'tagblock'],
    category: 'admin',
    description: 'Prevent users from tagging all members',
    usage: '.antitag <on|off|set>',
    groupOnly: true,
    strictOwnerOnly: true,

    async handler(sock, message, args, context = {}) {
        const chatId = context.chatId || message.key.remoteJid;
        const action = args[0]?.toLowerCase();

        if (!action) {
            const config = await getAntitag(chatId, 'on');
            await sock.sendMessage(chatId, {
                text: `*🏷️ ANTITAG SETUP*\n\n` +
                      `*Current Status:* ${config?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                      `*Current Action:* ${config?.action || 'Not set'}\n\n` +
                      `*Commands:*\n` +
                      `• \`.antitag on\` - Enable\n` +
                      `• \`.antitag off\` - Disable\n` +
                      `• \`.antitag set delete\` - Delete tagall messages\n` +
                      `• \`.antitag set kick\` - Kick users who tagall\n\n` +
                      `*Detection:*\n` +
                      `• Detects mentions of 50%+ members\n` +
                      `• Catches bot tagall patterns\n` +
                      `• Protects against spam tagging`
            }, { quoted: message });
            return;
        }

        switch (action) {
            case 'on':
                const existingConfig = await getAntitag(chatId, 'on');
                if (existingConfig?.enabled) {
                    await sock.sendMessage(chatId, {
                        text: '⚠️ *Antitag is already enabled*'
                    }, { quoted: message });
                    return;
                }
                const result = await setAntitag(chatId, 'on', 'delete');
                await sock.sendMessage(chatId, {
                    text: result 
                        ? '✅ *Antitag enabled successfully!*\n\nDefault action: Delete tagall messages' 
                        : '❌ *Failed to enable antitag*'
                }, { quoted: message });
                break;

            case 'off':
                await removeAntitag(chatId, 'on');
                await sock.sendMessage(chatId, {
                    text: '❌ *Antitag disabled*\n\nUsers can now tag all members.'
                }, { quoted: message });
                break;

            case 'set':
                if (args.length < 2) {
                    await sock.sendMessage(chatId, {
                        text: '❌ *Please specify an action*\n\nUsage: `.antitag set delete | kick`'
                    }, { quoted: message });
                    return;
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    await sock.sendMessage(chatId, {
                        text: '❌ *Invalid action*\n\nChoose: delete or kick'
                    }, { quoted: message });
                    return;
                }
                const setResult = await setAntitag(chatId, 'on', setAction);
                
                const actionDescriptions = {
                    delete: 'Delete tagall messages and warn users',
                    kick: 'Delete messages and remove users from group'
                };
                
                await sock.sendMessage(chatId, {
                    text: setResult 
                        ? `✅ *Antitag action set to: ${setAction}*\n\n${actionDescriptions[setAction]}`
                        : '❌ *Failed to set antitag action*'
                }, { quoted: message });
                break;

            case 'status':
            case 'get':
                const status = await getAntitag(chatId, 'on');
                await sock.sendMessage(chatId, {
                    text: `*🏷️ ANTITAG STATUS*\n\n` +
                          `*Status:* ${status?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                          `*Action:* ${status?.action || 'Not set'}\n\n` +
                          `*What happens when tagall is detected:*\n` +
                          `${status?.action === 'delete' ? '• Message is deleted\n• User gets warning' : ''}` +
                          `${status?.action === 'kick' ? '• Message is deleted\n• User is removed from group' : ''}\n\n` +
                          `*Detection threshold:* 50% of group members or 10+ mentions`
                }, { quoted: message });
                break;

            default:
                await sock.sendMessage(chatId, {
                    text: '❌ *Invalid command*\n\nUse `.antitag` to see available options.'
                }, { quoted: message });
        }
    },

    handleTagDetection
};
