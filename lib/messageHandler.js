
const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const store = require('./lightweight_store');
const commandHandler = require('./commandHandler');
const { printMessage, printLog } = require('./print');
const { isBanned } = require('./isBanned');
const { resolveOwner } = require('./owner');
const isAdmin = require('./isAdmin');
const { handleAutoread } = require('../plugins/autoread');
const { handleAutotypingForMessage, showTypingAfterCommand } = require('../plugins/autotyping');
const { storeMessage, handleMessageRevocation } = require('../plugins/antidelete');
const { handleBadwordDetection } = require('./antibadword');
const { handleLinkDetection } = require('../plugins/antilink');
const { handleTagDetection } = require('../plugins/antitag');
const { handleMentionDetection } = require('../plugins/mention');
const { handleChatbotResponse } = require('../plugins/chatbot');
const { handleTicTacToeMove } = require('../plugins/tictactoe');
const { handleSelection } = require('../plugins2/image');
const { addCommandReaction } = require('./reactions');
const { getInteractiveId, normalizeInteraction } = require('./interactiveMenu');
const { resolveMenuAction } = require('../menu/menu-actions');
const { handleDirectBix } = require('./bixRouter');

const { getChannelInfo, patchSock } = require('./channelInfo');

const channelInfo = getChannelInfo();

const MONGO_URL = process.env.MONGO_URL;
const POSTGRES_URL = process.env.POSTGRES_URL;
const MYSQL_URL = process.env.MYSQL_URL;
const SQLITE_URL = process.env.DB_URL;
const HAS_DB = !!(MONGO_URL || POSTGRES_URL || MYSQL_URL || SQLITE_URL);
const STICKER_FILE = path.join(__dirname, '../data/sticker_commands.json');
const ERROR_LOG_FILE = path.join(process.cwd(), 'error.log');
const ERROR_LOG_MAX_BYTES = 2 * 1024 * 1024;
const ERROR_LOG_RETAIN_BYTES = 512 * 1024;

function appendBoundedErrorLog(entry) {
    const line = JSON.stringify({
        command: String(entry.command || '').slice(0, 80),
        error: String(entry.error || '').slice(0, 2000),
        stack: String(entry.stack || '').slice(0, 12000),
        timestamp: entry.timestamp || new Date().toISOString(),
        user: String(entry.user || '').slice(0, 120),
        chat: String(entry.chat || '').slice(0, 120)
    }) + '\n';

    let size = 0;
    try { size = fs.statSync(ERROR_LOG_FILE).size; } catch {}
    if (size + Buffer.byteLength(line) > ERROR_LOG_MAX_BYTES) {
        try {
            const fd = fs.openSync(ERROR_LOG_FILE, 'r+');
            const keep = Math.min(size, ERROR_LOG_RETAIN_BYTES);
            const start = Math.max(0, size - keep);
            const buffer = Buffer.alloc(keep);
            fs.readSync(fd, buffer, 0, keep, start);
            fs.ftruncateSync(fd, 0);
            fs.writeSync(fd, buffer, 0, keep, 0);
            fs.closeSync(fd);
            size = keep;
        } catch {}
    }
    fs.appendFileSync(ERROR_LOG_FILE, line);
}

async function getStickerCommands() {
    if (HAS_DB) {
        const data = await store.getSetting('global', 'stickerCommands');
        return data || {};
    } else {
        try {
            if (!fs.existsSync(STICKER_FILE)) {
                return {};
            }
            return JSON.parse(fs.readFileSync(STICKER_FILE, 'utf8'));
        } catch {
            return {};
        }
    }
}

async function handleMessages(sock, messageUpdate) {
    // Install the global sendMessage wrapper as early as possible so command,
    // chatbot, moderation, Bix and background responses all share the same
    // native code-block behavior. patchSock() is idempotent.
    patchSock(sock);
    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;

        const message = messages[0];
        if (!message?.message) return;

        const earlyChatId = message.key.remoteJid;
        const earlySenderId = message.key.senderPn ||
            message.key.participant ||
            earlyChatId;
        try {
            const { handlePendingCookieMessage } = require('../plugins2/abix');
            if (await handlePendingCookieMessage(sock, message, earlySenderId, earlyChatId)) return;
        } catch (error) {
            printLog('error', `Cookie update handler failed: ${error.message}`);
        }

        await printMessage(message, sock);
        
        try {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            if (!ghostMode || !ghostMode.enabled) {
                await handleAutoread(sock, message);
            } else {
                printLog('info', '👻 Stealth mode active');
            }
        } catch (err) {
            await handleAutoread(sock, message);
        }

        const chatId = message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');

        if (message.message?.protocolMessage?.type === 0) {
            printLog('info', 'Message deletion detected');
            await handleMessageRevocation(sock, message);
            return;
        }

        await storeMessage(sock, message);
        try {
            const { handleTapReveal } = require('../plugins2/wa-tricks/tap-reveal.cjs');
            if (typeof handleTapReveal === 'function' && await handleTapReveal(sock, message)) return;
        } catch (tapRevealError) {
            printLog('error', `Tap reveal handler failed: ${tapRevealError.message}`);
        }


        const rawSenderId = message.key.participant || message.key.senderPn || message.key.remoteJid;
        const senderId = message.key.fromMe && !message.key.participant && !message.key.senderPn
            ? (sock?.user?.id || rawSenderId)
            : (String(rawSenderId).includes('@lid') && message.key.senderPn ? message.key.senderPn : rawSenderId);

        if (message.message?.stickerMessage) {
            const fileSha256 = message.message.stickerMessage.fileSha256;
            if (fileSha256) {
                const hash = Buffer.from(fileSha256).toString('base64');
                const stickers = await getStickerCommands();
                
                if (stickers[hash]) {
                    printLog('info', `🎨 Sticker command detected: ${stickers[hash].text}`);
                    
                    const commandText = stickers[hash].text;
                    const [cmdName, ...cmdArgs] = commandText.split(' ');
                    
                    let foundCommand = null;
                    let usedPrefix = '';
                    
                    for (const prefix of settings.prefixes) {
                        const testCmd = (prefix + cmdName).toLowerCase();
                        foundCommand = commandHandler.getCommand(testCmd, settings.prefixes);
                        if (foundCommand) {
                            usedPrefix = prefix;
                            break;
                        }
                    }
                    
                    if (foundCommand) {
                        const ownerInfo = await resolveOwner(senderId, sock, chatId);
                        const senderIsOwner = ownerInfo.isOwner;
                        const isOwnerCheck = senderIsOwner;

                        const botMode = await store.getBotMode();
                        const isAllowed = (() => {
                            if (isOwnerCheck) return true;
                            
                            switch (botMode) {
                                case 'public':
                                    return true;
                                case 'private':
                                case 'self':
                                    return false;
                                case 'groups':
                                    return isGroup;
                                case 'inbox':
                                    return !isGroup;
                                default:
                                    return true;
                            }
                        })();

                        if (!isAllowed) return;

                        const userBanned = await isBanned(senderId);
                        if (userBanned) return;

                        if (foundCommand.strictOwnerOnly) {
                            const { isOwnerOnlyAsync } = require('./isOwner');
                            if (!(await isOwnerOnlyAsync(senderId, sock, chatId))) {
                                return await sock.sendMessage(chatId, { 
                                    text: '❌ This command is only available for the bot owner!',
                                    ...channelInfo 
                                }, { quoted: message });
                            }
                        }

                        if (foundCommand.ownerOnly && !senderIsOwner) {
                            return await sock.sendMessage(chatId, { 
                                text: '❌ This command is only available for configured owners!',
                                ...channelInfo 
                            }, { quoted: message });
                        }

                        if (foundCommand.groupOnly && !isGroup) {
                            return await sock.sendMessage(chatId, { 
                                text: 'This command can only be used in groups!',
                                ...channelInfo 
                            }, { quoted: message });
                        }

                        let isSenderAdmin = false;
                        let isBotAdmin = false;

                        if ((foundCommand.adminOnly || (foundCommand.command === 'gcmenu' && ['on','off'].includes(String(commandText.split(/\s+/)[1] || '').toLowerCase()))) && isGroup) {
                            const adminStatus = await isAdmin(sock, chatId, senderId);
                            isSenderAdmin = adminStatus.isSenderAdmin;
                            isBotAdmin = adminStatus.isBotAdmin;

                            if (!isBotAdmin) {
                                return await sock.sendMessage(chatId, { 
                                    text: '❌ Please make the bot an admin to use this command.',
                                    ...channelInfo 
                                }, { quoted: message });
                            }

                            if (!isSenderAdmin && !senderIsOwner) {
                                return await sock.sendMessage(chatId, {
                                    text: '❌ Sorry, only group admins can use this command.',
                                    ...channelInfo
                                }, { quoted: message });
                            }
                        }

                        const syntheticMessage = {
                            key: message.key,
                            message: {
                                extendedTextMessage: {
                                    text: usedPrefix + commandText,
                                    contextInfo: message.message.stickerMessage.contextInfo || {}
                                }
                            },
                            messageTimestamp: message.messageTimestamp,
                            pushName: message.pushName,
                            broadcast: message.broadcast
                        };

                        const context = {
                            chatId,
                            senderId,
                            isGroup,
                            isSenderAdmin,
                            isBotAdmin,
                            isOwner: ownerInfo.isOwner,
                            isPrimaryOwner: ownerInfo.isPrimaryOwner,
                            isSecondaryOwner: ownerInfo.isSecondaryOwner,
                            isOwnerCheck,
                            channelInfo,
                            rawText: usedPrefix + commandText,
                            userMessage: (usedPrefix + commandText).toLowerCase(),
                            messageText: usedPrefix + commandText
                        };

                        try {
                            await foundCommand.handler(sock, syntheticMessage, cmdArgs, context);
                            await addCommandReaction(sock, message);
                            await showTypingAfterCommand(sock, chatId);
                            printLog('success', `✅ Sticker command executed: ${commandText}`);
                        } catch (error) {
                            printLog('error', `❌ Sticker command error [${commandText}]: ${error.message}`);
                            console.error(error.stack);
                            await sock.sendMessage(chatId, {
                                text: `❌ Error executing sticker command: ${error.message}`,
                                ...channelInfo
                            }, { quoted: message });
                        }
                    } else {
                        printLog('warning', `⚠️ Sticker command not found: ${commandText}`);
                    }
                    
                    return;
                }
            }
        }

        const interaction = normalizeInteraction(message);
        const interactiveId = interaction?.actionId || getInteractiveId(message);
        const interactiveCommand = interactiveId
            ? (resolveMenuAction(interactiveId, settings.prefixes[0]) || interactiveId)
            : '';

        const rawText = 
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            message.message?.imageMessage?.caption ||
            message.message?.videoMessage?.caption ||
            interactiveCommand ||
            message.message?.buttonsResponseMessage?.selectedButtonId ||
            '';

        const messageText = rawText.trim();
        const userMessage = messageText.toLowerCase();
        const configuredPrefix = settings.prefixes[0] || '-';

        // Conversational BISE Mardan roll-number lookup: consume the user's
        // name/father-name replies before normal command/chatbot handling.
        // The plugin keeps a short per-chat/per-user session and returns false
        // when no lookup is pending. A fresh -rlnmardan command is never eaten.
        try {
            const rollnoPlugin = require('../plugins2/rlnmardan');
            if (typeof rollnoPlugin.handlePendingRollnoMessage === 'function' &&
                await rollnoPlugin.handlePendingRollnoMessage(sock, message)) {
                return;
            }
        } catch (rollnoError) {
            printLog('error', `RLMARDAN pending handler failed: ${rollnoError.message}`);
        }

        const ownerInfo = await resolveOwner(senderId, sock, chatId);
        const senderIsOwner = ownerInfo.isOwner;
        const isOwnerCheck = senderIsOwner;

        // Direct Bix entry point: @bix, -@bix, -bix, and replies to a Bix message.
        // It is owner/secondary-owner protected inside bixRouter and is deliberately
        // handled before generic chatbot/command fallback can consume the message.
        try {
            const bixHandled = await handleDirectBix({ sock, message, chatId, senderId });
            if (bixHandled) return;
        } catch (error) {
            printLog('error', `Direct Bix handler failed: ${error.message}`);
            try {
                if (senderIsOwner) {
                    await sock.sendMessage(chatId, { text: `❌ Bix failed: ${error.message}` }, { quoted: message });
                }
            } catch {}
            return;
        }

        if (message.message?.buttonsResponseMessage) {
            const buttonId = message.message.buttonsResponseMessage.selectedButtonId;
            printLog('info', `Button response: ${buttonId}`);
            
            if (buttonId === 'channel') {
                await sock.sendMessage(chatId, { 
                    text: '*Join our Channel:*\n[https://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07](https://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07)' 
                }, { quoted: message });
                return;
            } else if (buttonId === 'owner') {
                const ownerCommand = require('../plugins/owner');
                await ownerCommand.handler(sock, message, [], { chatId, senderId });
                return;
            } else if (buttonId === 'support') {
                await sock.sendMessage(chatId, { 
                    text: `*Support*\n\nhttps://whatsapp.com/channel/0029VagJIAr3bbVBCpEkAM07` 
                }, { quoted: message });
                return;
            }
        }

        const userBanned = await isBanned(senderId);
        if (userBanned && !userMessage.startsWith((settings.prefixes[0] || '-') + 'unban')) {
            if (Math.random() < 0.1) {
                printLog('warning', `Banned user attempted command: ${senderId.split('@')[0]}`);
                await sock.sendMessage(chatId, {
                    text: 'You are banned from using the bot. Contact an admin to get unbanned.',
                    ...channelInfo
                });
            }
            return;
        }

        if (/^(?:[1-9]|10)$/.test(userMessage) || ['surrender', 'give up', 'cancel'].includes(userMessage)) {
            if (/^(?:[1-9]|10)$/.test(userMessage)) {
                const handledImage = await handleSelection(sock, message, chatId, senderId, userMessage);
                if (handledImage) return;
            }
            const handledGame = await handleTicTacToeMove(sock, chatId, senderId, userMessage);
            if (handledGame) return;
            if (/^[1-8]$/.test(userMessage)) {
                const handledNews = await require('../plugins/news').handleNumericReply(sock, message, userMessage);
                if (handledNews) return;
            }
        }

        if (!message.key.fromMe) {
            await store.incrementMessageCount(chatId, senderId);
        }

        // Moderation hooks must never prevent the command dispatcher from
        // handling a valid command. Run them best-effort and continue on error.
        if (isGroup) {
            try {
                const { handleSpamDetection } = require('../plugins2/spam');
                if (await handleSpamDetection(sock, chatId, message, senderId)) return;
            } catch (spamError) {
                printLog('error', `Anti-spam handler failed: ${spamError.message}`);
            }
            if (userMessage) {
                try {
                    await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
                } catch (error) {
                    printLog('error', `Badword middleware failed: ${error.message}`);
                }
            }
            try {
                await handleLinkDetection(sock, chatId, message, userMessage, senderId);
            } catch (error) {
                printLog('error', `Link middleware failed: ${error.message}`);
            }
        }

        if (!isGroup && !message.key.fromMe && !senderIsOwner) {
            try {
                const { readState: readPmBlockerState } = require('../plugins/pmblocker');
                const pmState = await readPmBlockerState();
                if (pmState.enabled) {
                    printLog('warning', `PM blocked from: ${senderId.split('@')[0]}`);
                    await sock.sendMessage(chatId, { 
                        text: pmState.message || 'Private messages are blocked. Please contact the owner in groups only.' 
                    });
                    await new Promise(r => setTimeout(r, 1500));
                    try { 
                        await sock.updateBlockStatus(chatId, 'block');
                        printLog('success', `Blocked user: ${senderId.split('@')[0]}`);
                    } catch (e) {
                        printLog('error', `Failed to block user: ${e.message}`);
                    }
                    return;
                }
            } catch (e) {
                printLog('error', `PM blocker error: ${e.message}`);
            }
        }

        // WA Broadcast Suite passive hooks: survey replies + configured autoresponder.
        // They run before normal command parsing and never inspect/consume prefixed commands.
        if (userMessage && !userMessage.startsWith(configuredPrefix)) {
            try {
                const broadcastBridge = require('../plugins2/wa-broadcast-suite/runtime.cjs');
                const consumedByBroadcast = await broadcastBridge.handleIncoming(
                    sock, message, userMessage, senderId, Boolean(ownerInfo?.isOwner || ownerInfo?.isPrimaryOwner)
                );
                if (consumedByBroadcast) return;
            } catch (broadcastError) {
                printLog('error', `Broadcast suite hook failed: ${broadcastError.message}`);
            }
        }

        const usedPrefix = settings.prefixes.find(p => userMessage.startsWith(p));

        const command = commandHandler.getCommand(userMessage, settings.prefixes);


        if (!usedPrefix && !command) {
            await handleAutotypingForMessage(sock, chatId, userMessage);

            if (isGroup) {
                await handleTagDetection(sock, chatId, message, senderId);
                await handleMentionDetection(sock, chatId, message);
                
                const botMode = await store.getBotMode();
                const canUseChatbot = botMode === 'public' || 
                                     (botMode === 'groups' && isGroup) || 
                                     (botMode === 'inbox' && !isGroup) ||
                                     isOwnerCheck;
                
                if (canUseChatbot) {
                    await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
                }
            }
            return;
        }

        if (!command) {
            if (isGroup) {
                await handleTagDetection(sock, chatId, message, senderId);
                await handleMentionDetection(sock, chatId, message);
                const botMode = await store.getBotMode();
                const canUseChatbot = botMode === 'public' || 
                                     (botMode === 'groups' && isGroup) || 
                                     (botMode === 'inbox' && !isGroup) ||
                                     isOwnerCheck;
                
                if (canUseChatbot) {
                    await handleChatbotResponse(sock, chatId, message, userMessage, senderId);
                }
            }
            return;
        }

        const botMode = await store.getBotMode();
        const isAllowed = (() => {
            if (isOwnerCheck) return true;
            
            switch (botMode) {
                case 'public':
                    return true;
                case 'private':
                case 'self':
                    return false;
                case 'groups':
                    return isGroup;
                case 'inbox':
                    return !isGroup;
                default:
                    return true;
            }
        })();

        if (!isAllowed) {
            return;
        }

        let args;
        if (usedPrefix) {
            const originalCommandText = messageText.slice(usedPrefix.length).trim();
            args = originalCommandText.split(/\s+/).slice(1);
        } else {
            args = messageText.trim().split(/\s+/).slice(1);
        }

        let ownerVerified = false;
        if (command.strictOwnerOnly) {
            const { isOwnerOnlyAsync } = require('./isOwner');
            ownerVerified = await isOwnerOnlyAsync(senderId, sock, chatId);
            if (!ownerVerified) {
                return await sock.sendMessage(chatId, { 
                    text: command.command === 'abix' ? '❌ Owner only command.' : '❌ This command is only available for the primary owner.',
                    ...channelInfo 
                }, { quoted: message });
            }
        }

        if (command.ownerOnly && !senderIsOwner) {
            return await sock.sendMessage(chatId, { 
                text: '❌ This command is only available for configured owners!',
                ...channelInfo 
            }, { quoted: message });
        }

        if (command.groupOnly && !isGroup) {
            return await sock.sendMessage(chatId, { 
                text: 'This command can only be used in groups!',
                ...channelInfo 
            }, { quoted: message });
        }
        
        let isSenderAdmin = false;
        let isBotAdmin = false;

        if ((command.adminOnly || (command.command === 'gcmenu' && ['on','off'].includes(String(args[0] || '').toLowerCase()))) && isGroup) {
            const adminStatus = await isAdmin(sock, chatId, senderId);
            isSenderAdmin = adminStatus.isSenderAdmin;
            isBotAdmin = adminStatus.isBotAdmin;

            if (!isBotAdmin) {
                return await sock.sendMessage(chatId, { 
                    text: '❌ Please make the bot an admin to use this command.',
                    ...channelInfo 
                }, { quoted: message });
            }

            if (!isSenderAdmin && !senderIsOwner) {
                return await sock.sendMessage(chatId, {
                    text: '❌ Sorry, only group admins can use this command.',
                    ...channelInfo
                }, { quoted: message });
            }
        }

        const context = {
            chatId,
            senderId,
            isGroup,
            isSenderAdmin,
            isBotAdmin,
            isOwner: ownerInfo.isOwner,
            isPrimaryOwner: ownerInfo.isPrimaryOwner,
            isSecondaryOwner: ownerInfo.isSecondaryOwner,
            isOwnerOnly: ownerInfo.isPrimaryOwner,
            isOwnerCheck,
            channelInfo,
            rawText,
            userMessage,
            messageText,
            isInteraction: Boolean(interaction?.actionId || interactiveId),
            interactiveActionId: interactiveId || null,
            prefix: configuredPrefix
        };

        try {
            await command.handler(sock, message, args, context);
            await addCommandReaction(sock, message);
            await showTypingAfterCommand(sock, chatId);
        } catch (error) {
            printLog('error', `Command error [${command.command}]: ${error.message}`);
            console.error(error.stack);
            
            try {
                await sock.sendMessage(chatId, {
                    text: `❌ Error executing command: ${error.message}`,
                    ...channelInfo
                }, { quoted: message });
            } catch (sendError) {
                printLog('error', `Failed to send command error message: ${sendError.message}`);
            }

            const errorLog = {
                command: command.command,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString(),
                user: senderId,
                chat: chatId
            };
            
            try {
                appendBoundedErrorLog(errorLog);
                printLog('info', 'Error logged to file');
            } catch (e) {
                printLog('error', `Failed to write error log: ${e.message}`);
            }
        }

    } catch (error) {
        printLog('error', `Message handler error: ${error.message}`);
        console.error(error.stack);
        
        // Never send a generic error reply from the top-level message
        // handler. The reply itself becomes another WhatsApp message event
        // and can create a recursive error loop.
    }
 }


async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action, author } = update;
        if (!id.endsWith('@g.us')) return;

        printLog('info', `Group update: ${action} in ${id.split('@')[0]}`);

        const botMode = await store.getBotMode();
        const isPublicMode = botMode === 'public' || botMode === 'groups';

        switch (action) {
            case 'promote':
                if (!isPublicMode) return;
                if (participants && participants.length > 0) {
                    const participant = Array.isArray(participants) ? participants[0] : participants;
                    printLog('success', `User promoted: ${typeof participant === 'string' ? participant.split('@')[0] : 'unknown'}`);
                }
                const { handlePromotionEvent } = require('../plugins/promote');
                await handlePromotionEvent(sock, id, participants, author);
                break;

            case 'demote':
                if (!isPublicMode) return;
                if (participants && participants.length > 0) {
                    const participant = Array.isArray(participants) ? participants[0] : participants;
                    printLog('warning', `User demoted: ${typeof participant === 'string' ? participant.split('@')[0] : 'unknown'}`);
                }
                const { handleDemotionEvent } = require('../plugins/demote');
                await handleDemotionEvent(sock, id, participants, author);
                break;

            case 'add':
                if (participants && participants.length > 0) {
                    const participant = Array.isArray(participants) ? participants[0] : participants;
                    printLog('success', `User joined: ${typeof participant === 'string' ? participant.split('@')[0] : 'unknown'}`);
                }
                const { handleJoinEvent } = require('../plugins/welcome');
                await handleJoinEvent(sock, id, participants);
                break;

            case 'remove':
                if (participants && participants.length > 0) {
                    const participant = Array.isArray(participants) ? participants[0] : participants;
                    printLog('info', `User left: ${typeof participant === 'string' ? participant.split('@')[0] : 'unknown'}`);
                }
                const { handleLeaveEvent } = require('../plugins/goodbye');
                await handleLeaveEvent(sock, id, participants);
                break;

            default:
                printLog('warning', `Unhandled group action: ${action}`);
        }
    } catch (error) {
        printLog('error', `Group update error: ${error.message}`);
        console.error(error.stack);
    }
}

async function handleStatus(sock, status) {
    try {
        const { handleStatusUpdate } = require('../plugins/autostatus');
        await handleStatusUpdate(sock, status);
    } catch (error) {
        printLog('error', `Status handler error: ${error.message}`);
        console.error(error.stack);
    }
}

async function handleCall(sock, calls) {
    try {
        const anticallPlugin = require('../plugins/anticall');
        const state = anticallPlugin.readState ? await anticallPlugin.readState() : { enabled: false };
        if (!state.enabled) return;

        const antiCallNotified = new Set();

        for (const call of calls) {
            const callerJid = call.from || call.peerJid || call.chatId;
            if (!callerJid) continue;

            printLog('warning', `Incoming call from: ${callerJid.split('@')[0]}`);

            try {
                try {
                    if (typeof sock.rejectCall === 'function' && call.id) {
                        await sock.rejectCall(call.id, callerJid);
                        printLog('success', `Call rejected: ${callerJid.split('@')[0]}`);
                    } else if (typeof sock.sendCallOfferAck === 'function' && call.id) {
                        await sock.sendCallOfferAck(call.id, callerJid, 'reject');
                        printLog('success', `Call rejected: ${callerJid.split('@')[0]}`);
                    }
                } catch (e) {
                    printLog('error', `Error rejecting call: ${e.message}`);
                }

                if (!antiCallNotified.has(callerJid)) {
                    antiCallNotified.add(callerJid);
                    setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                    
                    await sock.sendMessage(callerJid, { 
                        text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' 
                    });
                    printLog('info', `Sent anticall warning to: ${callerJid.split('@')[0]}`);
                }

                setTimeout(async () => {
                    try { 
                        await sock.updateBlockStatus(callerJid, 'block');
                        printLog('success', `Blocked caller: ${callerJid.split('@')[0]}`);
                    } catch (e) {
                        printLog('error', `Error blocking caller: ${e.message}`);
                    }
                }, 800);

            } catch (error) {
                printLog('error', `Error handling call from ${callerJid.split('@')[0]}: ${error.message}`);
            }
        }
    } catch (error) {
        printLog('error', `Call handler error: ${error.message}`);
        console.error(error.stack);
    }
}

module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus,
    handleCall
};
