/* process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; */

// ─────────────────────────────────────────────────────────────
// DEPENDENCY PREFLIGHT
// Gives a clear error if node_modules is broken/corrupted,
// instead of a cryptic MODULE_NOT_FOUND later in the file.
// ─────────────────────────────────────────────────────────────
(function preflightDeps() {
    const required = [
        'file-type',
        'axios',
        'pino',
        'node-cache',
        'awesome-phonenumber',
        'libphonenumber-js',
        '@whiskeysockets/baileys'
    ];
    const missing = [];
    for (const mod of required) {
        try { require.resolve(mod); }
        catch (_) { missing.push(mod); }
    }
    if (missing.length) {
        console.error('\n\x1b[41m\x1b[30m DEPENDENCY CHECK FAILED \x1b[0m');
        console.error('Missing modules: ' + missing.join(', '));
        console.error('Run one of these on the server shell:');
        console.error('   npm run reinstall');
        console.error('   # or manually:');
        console.error('   rm -rf node_modules package-lock.json');
        console.error('   npm cache clean --force && npm install --no-audit --no-fund\n');
        process.exit(1);
    }
})();


// ─────────────────────────────────────────────────────────────
// STARTUP DISK CLEANUP - runs before config loads
// ─────────────────────────────────────────────────────────────
(function cleanupTempDirs() {
    const fsSync = require('fs');
    const pathLib = require('path');
    const os = require('os');
    const dirsToClean = [
        pathLib.join(os.tmpdir(), 'abix-gdl'),
        pathLib.join(os.tmpdir(), 'abix-bgr'),
        pathLib.join(os.tmpdir(), 'abix-sticker'),
        pathLib.join(os.tmpdir(), 'abix-media'),
    ];
    let freed = 0;
    for (const dir of dirsToClean) {
        try {
            if (!fsSync.existsSync(dir)) continue;
            const files = fsSync.readdirSync(dir);
            for (const file of files) {
                try {
                    const full = pathLib.join(dir, file);
                    freed += (fsSync.statSync(full).size || 0);
                    fsSync.rmSync(full, { recursive: true, force: true });
                } catch {}
            }
            if (files.length) console.log(`[CLEANUP] Cleared ${files.length} temp file(s) from ${dir}`);
        } catch {}
    }
    if (freed > 0) console.log(`[CLEANUP] Freed ${(freed / 1024 / 1024).toFixed(2)} MB of disk space`);
})();

require('./config');
require('./settings');

const fs = require('fs');
const RESET = '\x1b[0m';
const style = (code) => {
    const fn = (value) => `${code}${value}${RESET}`;
    fn.bold = (value) => `\x1b[1m${code}${value}${RESET}`;
    return fn;
};
const chalk = {
    yellow: style('\x1b[33m'),
    bgBlack: style('\x1b[40m'),
    greenBright: style('\x1b[92m'),
    black: style('\x1b[30m'),
    bgGreen: style('\x1b[42m'),
    white: style('\x1b[37m'),
    gray: style('\x1b[90m'),
    bold: style('\x1b[1m'),
    blue: style('\x1b[34m'),
    cyan: style('\x1b[36m'),
    magenta: style('\x1b[35m'),
    green: style('\x1b[32m'),
    red: style('\x1b[31m'),
    blueBright: style('\x1b[94m'),
    redBright: style('\x1b[91m'),
    hex: () => style('')
};
const syntaxerror = require('syntax-error');
const path = require('path');
const axios = require('axios');
const PhoneNumber = require('awesome-phonenumber');
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif');
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    Browsers,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys");
const NodeCache = require("node-cache");
const pino = require("pino");
const readline = require("readline");
const { parsePhoneNumber } = require("libphonenumber-js");
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics');
const { rmSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');

const store = require('./lib/lightweight_store');
const SaveCreds = require('./lib/session');
const { app, server, PORT, HOST, configureDashboard, startRenderKeepAlive } = require('./lib/server');
const { getChannelInfo, patchSock } = require('./lib/channelInfo');
const { printLog } = require('./lib/print');
const {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus,
    handleCall
} = require('./lib/messageHandler');

const settings = require('./settings');
const commandHandler = require('./lib/commandHandler');
const { startTelegramBot, stopTelegramBot } = require('./lib/telegramBot');
const { ownerNumbers } = require('./lib/owner');
const { getConfiguredApiInventory, configuredApifyTokens } = require('./lib/api-health');
const { startGemini, stopGemini } = require('./lib/geminiService');

store.readFromFile();

commandHandler.loadCommands();
configureDashboard(commandHandler);
const commandReport = commandHandler.getLoadReport();
console.log(`[COMMANDS] Loaded: ${commandReport.loaded}`);
console.log(`[COMMANDS] Duplicate commands: ${commandReport.duplicates}`);
console.log(`[COMMANDS] Duplicate aliases: ${commandReport.duplicateAliases}`);
console.log(`[COMMANDS] Broken plugins: ${commandReport.broken}`);
console.log(`[OWNER] Primary configured: ${ownerNumbers().length > 0 ? 'YES' : 'NO'} | Secondary configured: ${Math.max(0, ownerNumbers().length - 1)}`);
console.log(`[API] Apify token pool configured: ${configuredApifyTokens().length > 0 ? 'YES' : 'NO'}`);
for (const api of getConfiguredApiInventory()) {
    console.log(`[API] ${api.name}: ${api.configured ? 'CONFIGURED' : 'CONFIGURATION REQUIRED'}`);
}

setInterval(() => {
    if (global.gc) {
        global.gc();
        console.log('🧹 Garbage collection completed');
    }
}, 60_000);

const MEMORY_WARN_MB = Number(process.env.BOT_MEMORY_WARN_MB || 450);
let lastMemoryWarningAt = 0;
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024;
    if (used <= MEMORY_WARN_MB) return;
    const now = Date.now();
    if (now - lastMemoryWarningAt < 5 * 60 * 1000) return;
    lastMemoryWarningAt = now;
    console.log(chalk.yellow(`⚠️ RAM high (${Math.round(used)}MB). Running garbage collection; process will not self-terminate.`));
    if (global.gc) { try { global.gc(); } catch {} }
}, 30_000);

let phoneNumber = String(process.env.PAIRING_NUMBER || settings.ownerNumber || '').replace(/\D/g, '');

global.botname = process.env.BOT_NAME || 'ABIX';
global.themeemoji = "•";

const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code");
const useMobile = process.argv.includes("--mobile");

let rl = null;
if (process.stdin.isTTY && !process.env.PAIRING_NUMBER) {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

const question = (text) => {
    if (rl && !rl.closed) {
        return new Promise((resolve) => rl.question(text, resolve));
    } else {
        return Promise.resolve(settings.ownerNumber || phoneNumber);
    }
};

process.on('exit', () => {
    if (rl && !rl.closed) {
        rl.close();
    }
});

process.on('SIGINT', () => {
    if (rl && !rl.closed) {
        rl.close();
    }
    stopTelegramBot().catch(() => {});
    stopGemini();
    if (server.listening) server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    if (rl && !rl.closed) rl.close();
    stopTelegramBot().catch(() => {});
    stopGemini();
    if (server.listening) server.close();
    process.exit(0);
});

function getSessionDirectory() {
    return path.resolve(process.env.SESSION_DIR || path.join(__dirname, 'session'));
}

function ensureSessionDirectory() {
    const sessionPath = getSessionDirectory();
    if (!existsSync(sessionPath)) {
        mkdirSync(sessionPath, { recursive: true });
    }
    return sessionPath;
}

function hasValidSession() {
    try {
        const credsPath = path.join(getSessionDirectory(), 'creds.json');

        if (!existsSync(credsPath)) {
            return false;
        }

        const fileContent = fs.readFileSync(credsPath, 'utf8');
        if (!fileContent || fileContent.trim().length === 0) {
            printLog('warning', 'creds.json exists but is empty');
            return false;
        }

        try {
            const creds = JSON.parse(fileContent);
            if (!creds.noiseKey || !creds.signedIdentityKey || !creds.signedPreKey) {
                printLog('warning', 'creds.json is missing required fields');
                return false;
            }
            if (creds.registered === false) {
                printLog('warning', 'Session credentials exist but are not registered');
                try {
                    rmSync(getSessionDirectory(), { recursive: true, force: true });
                } catch (e) {}
                return false;
            }

            printLog('success', 'Valid and registered session credentials found');
            return true;
        } catch (parseError) {
            printLog('warning', 'creds.json contains invalid JSON');
            return false;
        }
    } catch (error) {
        printLog('error', `Error checking session validity: ${error.message}`);
        return false;
    }
}

async function initializeSession() {
    ensureSessionDirectory();

    const txt = global.SESSION_ID || process.env.SESSION_ID;

    if (!txt) {
        printLog('warning', 'No SESSION_ID found in environment variables');
        if (hasValidSession()) {
            printLog('success', 'Existing session found. Using saved credentials');
            return true;
        }
        printLog('warning', 'No existing session found. Pairing code will be required');
        return false;
    }

    if (hasValidSession()) {
        return true;
    }

    try {
        await SaveCreds(txt);
        await delay(2000);

        if (hasValidSession()) {
            printLog('success', 'Session file verified and valid');
            await delay(1000);
            return true;
        } else {
            printLog('error', 'Session file not valid after download');
            return false;
        }
    } catch (error) {
        printLog('error', `Error downloading session: ${error.message}`);
        return false;
    }
}

if (!server.listening) {
    server.listen(PORT, HOST, () => {
        global.__ABIX_WEB_STATE = {
            ...(global.__ABIX_WEB_STATE || {}),
            web: 'listening',
            host: HOST,
            port: PORT,
            lastChangeAt: Date.now(),
        };
        printLog('success', `Web server listening on ${HOST}:${PORT}`);
        // Best-effort HTTP keep-alive for Render's 15-minute free-tier idle timeout.
        startRenderKeepAlive();
    });
}

async function startWhatsAppBot() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion();

        ensureSessionDirectory();
        await delay(1000);

        const { state, saveCreds } = await useMultiFileAuthState(ensureSessionDirectory());
        const msgRetryCounterCache = new NodeCache();

        const hasRegisteredCreds = state.creds && state.creds.registered !== undefined;
        printLog('info', `Credentials loaded. Registered: ${state.creds?.registered || false}`);

        const ghostMode = await store.getSetting('global', 'stealthMode');
        const isGhostActive = ghostMode && ghostMode.enabled;

        if (isGhostActive) {
            printLog('info', '👻 STEALTH MODE IS ACTIVE - Starting in stealth mode');
        }

        const QasimDev = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.macOS('Chrome'),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: !isGhostActive,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid);
                let msg = await store.loadMessage(jid, key.id);
                return msg?.message || "";
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        });

        // Global sendMessage patch: native code blocks now work for every
        // outgoing bot surface, not only command plugins.
        patchSock(QasimDev);

        try {
            const runtime = await import('./lib/bix/botRuntime.js');
            if (typeof runtime.registerBixRuntime === 'function') {
                runtime.registerBixRuntime({
                    getSocket: () => QasimDev,
                    startBot: async () => {
                        if (QasimDev && QasimDev.ws) return { alreadyRunning: true };
                        return startWhatsAppBot();
                    },
                    restartBot: async () => {
                        QasimDev.__bixRestarting = true;
                        try {
                            if (QasimDev?.ws && typeof QasimDev.ws.close === 'function') QasimDev.ws.close();
                        } catch {}
                        await delay(1200);
                        return startWhatsAppBot();
                    },
                });
            }
            if (typeof runtime.setBixRuntimeSocket === 'function') runtime.setBixRuntimeSocket(QasimDev);
        } catch (runtimeError) {
            printLog('warning', `Bix runtime registration skipped: ${runtimeError.message}`);
        }

        const originalSendPresenceUpdate = QasimDev.sendPresenceUpdate;
        const originalReadMessages = QasimDev.readMessages;
        const originalSendReceipt = QasimDev.sendReceipt;
        const originalSendReadReceipt = QasimDev.sendReadReceipt;

        QasimDev.sendPresenceUpdate = async function(...args) {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            if (ghostMode && ghostMode.enabled) {
                printLog('info', '👻 Blocked presence update (stealth mode)');
                return;
            }
            return originalSendPresenceUpdate.apply(this, args);
        };

        QasimDev.readMessages = async function(...args) {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            if (ghostMode && ghostMode.enabled) {
                return;
            }
            return originalReadMessages.apply(this, args);
        };

        if (originalSendReceipt) {
            QasimDev.sendReceipt = async function(...args) {
                const ghostMode = await store.getSetting('global', 'stealthMode');
                if (ghostMode && ghostMode.enabled) {
                    return;
                }
                return originalSendReceipt.apply(this, args);
            };
        }

        if (originalSendReadReceipt) {
            QasimDev.sendReadReceipt = async function(...args) {
                const ghostMode = await store.getSetting('global', 'stealthMode');
                if (ghostMode && ghostMode.enabled) {
                    return;
                }
                return originalSendReadReceipt.apply(this, args);
            };
        }

        const originalQuery = QasimDev.query;
        QasimDev.query = async function(node, ...args) {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            if (ghostMode && ghostMode.enabled) {
                if (node && node.tag === 'receipt') {
                    return;
                }
                if (node && node.attrs && (node.attrs.type === 'read' || node.attrs.type === 'read-self')) {
                    return;
                }
            }
            return originalQuery.apply(this, [node, ...args]);
        };

        QasimDev.isGhostMode = async () => {
            const ghostMode = await store.getSetting('global', 'stealthMode');
            return ghostMode && ghostMode.enabled;
        };

        QasimDev.ev.on('creds.update', saveCreds);
        store.bind(QasimDev.ev);

        QasimDev.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;

                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage')
                    ? mek.message.ephemeralMessage.message
                    : mek.message;

                // Allow owner's own messages through so the bot responds to commands
                // typed from the owner's device (fromMe === true on that session).
                // Status broadcasts are handled separately below.

                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(QasimDev, chatUpdate);
                    return;
                }

                if (!QasimDev.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                    const isGroup = mek.key?.remoteJid?.endsWith('@g.us');
                    if (!isGroup) return;
                }

                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return;

                if (QasimDev?.msgRetryCounterCache) {
                    QasimDev.msgRetryCounterCache.clear();
                }

                try {
                    await handleMessages(QasimDev, chatUpdate);
                } catch (err) {
                    printLog('error', `Error in handleMessages: ${err.message}`);
                }
            } catch (err) {
                printLog('error', `Error in messages.upsert: ${err.message}`);
            }
        });

        QasimDev.decodeJid = (jid) => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {};
                return decode.user && decode.server && decode.user + '@' + decode.server || jid;
            } else return jid;
        };

        QasimDev.ev.on('contacts.update', update => {
            for (let contact of update) {
                let id = QasimDev.decodeJid(contact.id);
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
            }
        });

        QasimDev.getName = (jid, withoutContact = false) => {
            const id = QasimDev.decodeJid(jid);
            withoutContact = QasimDev.withoutContact || withoutContact;
            let v;
            if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
                v = store.contacts[id] || {};
                if (!(v.name || v.subject)) v = QasimDev.groupMetadata(id) || {};
                resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'));
            });
            else v = id === '0@s.whatsapp.net' ? {
                id,
                name: 'WhatsApp'
            } : id === QasimDev.decodeJid(QasimDev.user.id) ?
                QasimDev.user :
                (store.contacts[id] || {});
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international');
        };

        QasimDev.public = true;
        QasimDev.serializeM = (m) => smsg(QasimDev, m, store);

        if (state.creds?.registered === true && rl && !rl.closed) {
            rl.close();
            rl = null;
        }

        let pairingRequestStarted = false;

        QasimDev.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s;

            // Baileys signals readiness for pairing through the QR update.
            // Request the phone-number pairing code only once per socket, here,
            // rather than immediately after makeWASocket() returns.
            if (qr && pairingCode && state.creds?.registered !== true && !pairingRequestStarted) {
                pairingRequestStarted = true;
                try {
                    if (useMobile) {
                        throw new Error('Pairing-code login is not supported with --mobile.');
                    }

                    let pairingNumber = String(global.phoneNumber || phoneNumber || settings.ownerNumber || '').replace(/\D/g, '');
                    if (!pairingNumber && rl && !rl.closed) {
                        pairingNumber = String(await question(
                            'Enter your WhatsApp number with country code (digits only): '
                        )).replace(/\D/g, '');
                    }
                    if (!pairingNumber || !PhoneNumber('+' + pairingNumber).isValid()) {
                        throw new Error('Set a valid OWNER_NUMBER or PAIRING_NUMBER including the country code.');
                    }

                    const code = await QasimDev.requestPairingCode(pairingNumber);
                    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    console.log(chalk.black(chalk.bgGreen('🔗 YOUR PAIRING CODE: ')), chalk.black(chalk.white(formattedCode)));
                    console.log(chalk.yellow('Open WhatsApp → Linked Devices → Link a Device → Link with phone number instead.'));
                    printLog('success', 'WhatsApp pairing code generated.');
                    if (rl && !rl.closed) {
                        rl.close();
                        rl = null;
                    }
                } catch (error) {
                    printLog('error', `WhatsApp pairing failed: ${error?.stack || error?.message || String(error)}`);
                }
            }

            global.__ABIX_WEB_STATE = {
                ...(global.__ABIX_WEB_STATE || {}),
                status: connection || (global.__ABIX_WEB_STATE || {}).status || 'starting',
                lastChangeAt: Date.now(),
            };

            if (connection === 'connecting') {
                printLog('connection', 'Connecting to WhatsApp...');
            }

            if (connection == "open") {
                global.__ABIX_WEB_STATE = {
                    ...(global.__ABIX_WEB_STATE || {}),
                    status: 'connected',
                    connectedAt: Date.now(),
                    lastChangeAt: Date.now(),
                };
                try {
                    const runtime = await import('./lib/bix/botRuntime.js');
                    if (typeof runtime.setBixRuntimeSocket === 'function') runtime.setBixRuntimeSocket(QasimDev);
                    if (typeof runtime.setBotReady === 'function') runtime.setBotReady();
                } catch {}
                QasimDev.__bixRestarting = false;
                printLog('success', 'Bot connected successfully!');

                try {
                    const setbio = require('./plugins/setbio');
                    if (typeof setbio.startAutoBio === 'function') {
                        await setbio.startAutoBio(QasimDev);
                        printLog('success', 'AutoBio started');
                    }
                } catch (error) {
                    printLog('warning', `AutoBio skipped: ${error.message}`);
                }

                try {
                    const feedMonitor = require('./lib/feedMonitor');
                    if (typeof feedMonitor.start === 'function') await feedMonitor.start(QasimDev);
                } catch (error) {
                    printLog('warning', `Feed monitor skipped: ${error.message}`);
                }
                const ghostMode = await store.getSetting('global', 'stealthMode');
                if (ghostMode && ghostMode.enabled) {
                    printLog('info', '👻 STEALTH MODE ACTIVE - Bot is in stealth mode');
                    console.log(chalk.gray('• No online status'));
                    console.log(chalk.gray('• No typing indicators'));
                }

                console.log(chalk.yellow(`🌿Connected to => ` + JSON.stringify(QasimDev.user, null, 2)));

                try {
                    const botNumber = QasimDev.user.id.split(':')[0] + '@s.whatsapp.net';
                    const ghostStatus = (ghostMode && ghostMode.enabled) ? '\n👻 Stealth Mode: ACTIVE' : '';

                    await QasimDev.sendMessage(botNumber, {
                        text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!${ghostStatus}\n\n✅ Make sure to join our channel`,
                        ...getChannelInfo({ newsletterName: settings.newsletterName || settings.botName || 'ABIX' })
                    });
                } catch (error) {
                    printLog('error', `Failed to send connection message: ${error.message}`);
                }

                 await delay(1999);
                console.log(chalk.yellow(`\n\n                  ${chalk.bold(chalk.blue(`[ ${global.botname || 'ABIX'} ]`))}\n\n`));
                console.log(chalk.cyan(`< ================================================== >`));
                console.log(chalk.magenta(`\n${global.themeemoji || '•'} CREATOR: ABIX`));
                console.log(chalk.magenta(`${global.themeemoji || '•'} BOT: ABIX`));
                console.log(chalk.magenta(`${global.themeemoji || '•'} WA NUMBER: ${QasimDev.user?.id || 'unknown'}`));
                console.log(chalk.magenta(`${global.themeemoji || '•'} OWNER CONFIGURED: ${settings.ownerNumber ? 'YES' : 'NO'}`));
                console.log(chalk.green(`${global.themeemoji || '•'} 🤖 Bot Connected Successfully! ✅`));
                console.log(chalk.blue(`Bot Version: ${settings.version}`));
                console.log(chalk.cyan(`Loaded Commands: ${commandHandler.commands.size}`));
                console.log(chalk.cyan(`Prefixes: ${settings.prefixes.join(', ')}`));
                console.log(chalk.gray(`Backend: ${store.getStats().backend}`));
                console.log();
            }

            if (connection === 'close') {
                global.__ABIX_WEB_STATE = {
                    ...(global.__ABIX_WEB_STATE || {}),
                    status: 'disconnected',
                    lastChangeAt: Date.now(),
                };
                try {
                    const runtime = await import('./lib/bix/botRuntime.js');
                    if (typeof runtime.setBotStopped === 'function') runtime.setBotStopped();
                } catch {}
                if (QasimDev.__bixRestarting) {
                    printLog('info', 'Bix requested a controlled bot restart; skipping the old connection auto-reconnect.');
                    return;
                }
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                const statusCode = lastDisconnect?.error?.output?.statusCode;

                printLog('error', `Connection closed - Status: ${statusCode}`);

                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    try {
                        rmSync(getSessionDirectory(), { recursive: true, force: true });
                        printLog('warning', 'Session logged out. Please re-authenticate');
                    } catch (error) {
                        printLog('error', `Error deleting session: ${error.message}`);
                    }
                }

                if (shouldReconnect) {
                    printLog('connection', 'Reconnecting in 5 seconds...');
                    await delay(5000);
                    startWhatsAppBot();
                }
            }
        });

        QasimDev.ev.on('call', async (calls) => {
            await handleCall(QasimDev, calls);
        });

        QasimDev.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(QasimDev, update);
        });

        QasimDev.ev.on('status.update', async (status) => {
            await handleStatus(QasimDev, status);
        });

        QasimDev.ev.on('messages.reaction', async (reaction) => {
            await handleStatus(QasimDev, reaction);
        });

        return QasimDev;
    } catch (error) {
        printLog('error', `WhatsApp startup failed: ${error?.stack || error?.message || String(error)}`);

        if (rl && !rl.closed) {
            rl.close();
            rl = null;
        }

        await delay(5000);
        startWhatsAppBot();
    }
}


async function main() {
    printLog('info', 'Starting ABIX BOT...');

    // Start Telegram before optional AI initialization: a slow or failed Gemini
    // backend must not prevent Telegram slash commands from becoming available.
    // Telegram runs as a separate transport and must never block WhatsApp.
    startTelegramBot({ commandHandler }).then((result) => {
        if (result?.enabled) printLog('success', `Telegram transport enabled${result.username ? ` as @${result.username}` : ''}.`);
    }).catch((error) => {
        printLog('warning', `Telegram transport unavailable; check Telegram logs/configuration: ${error.message}`);
    });

    try {
        await startGemini();
    } catch (error) {
        printLog('warning', `Gemini startup failed; messaging transports will continue: ${error.message}`);
    }

    const sessionReady = await initializeSession();

    if (sessionReady) {
        printLog('success', 'Session initialization complete. Starting bot...');
    } else {
        printLog('warning', 'Session initialization incomplete. Will attempt pairing...');
    }

    await delay(3000);

    startWhatsAppBot().catch(error => {
        printLog('error', `Fatal error: ${error.message}`);

        if (rl && !rl.closed) {
            rl.close();
        }

        process.exit(1);
    });
}

main();


const customTemp = path.join(process.cwd(), 'temp');
if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });
process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;

setInterval(() => {
  fs.readdir(customTemp, (err, files) => {
    if (err) return;
    for (const file of files) {
      const filePath = path.join(customTemp, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && Date.now() - stats.mtimeMs > 3 * 60 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    }
  });
//  console.log('🧹 Temp folder auto-cleaned');
}, 1 * 60 * 60 * 1000);

const folders = [
  path.join(__dirname, './lib'),
  path.join(__dirname, './Plugin')
];

let totalFiles = 0;
let okFiles = 0;
let errorFiles = 0;

folders.forEach(folder => {
  if (!fs.existsSync(folder)) return;

  fs.readdirSync(folder)
    .filter(file => file.endsWith('.js'))
    .forEach(file => {
      totalFiles++;
      const filePath = path.join(folder, file);

      try {
        const code = fs.readFileSync(filePath, 'utf-8');
        const err = syntaxerror(code, file, {
          sourceType: 'script',
          allowAwaitOutsideFunction: true
        });

        if (err) {
          console.error(chalk.red(`❌ Syntax error in ${filePath}:\n${err}`));
          errorFiles++;
        } else {
          okFiles++;
        }
      } catch (e) {
        console.error(chalk.yellow(`⚠️ Cannot read file ${filePath}:\n${e}`));
        errorFiles++;
      }
    });
});

/**
* console.log(chalk.greenBright(`✅ OK files: ${okFiles}`));
* console.log(chalk.redBright(`❌Files with errors: ${errorFiles}\n`));
*/

process.on('uncaughtException', (err) => {
    printLog('error', `Uncaught Exception: ${err.message}`);
    console.error(err.stack);
});

process.on('unhandledRejection', (err) => {
    printLog('error', `Unhandled Rejection: ${err.message}`);
    console.error(err.stack);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        printLog('error', `Address localhost:${PORT} in use`);
        server.close();
    } else {
        printLog('error', `Server error: ${error.message}`);
    }
});

// Never require index.js again from its own file watcher. That pattern creates
// duplicate signal handlers, intervals and HTTP listeners and is the source of
// ERR_SERVER_ALREADY_LISTEN after a live reload. Plugin reloads are handled by
// the existing command registry instead. A process manager can restart the bot
// when a full application restart is actually required.
let file = require.resolve(__filename);
let indexWatchTimer = null;
fs.watchFile(file, { interval: 1000 }, () => {
    clearTimeout(indexWatchTimer);
    indexWatchTimer = setTimeout(() => {
        printLog('info', 'index.js changed; keeping the current WhatsApp/HTTP process alive. Use .abixadmin reload for plugins.');
    }, 250);
});
