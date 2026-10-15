/**
 * reply-quote.cjs — Message ki tarah QUOTE (reply box) 💬
 * ========================================================
 * Jab bot kisi message ka reply karta hai to WhatsApp
 * original message quote box mein dikhata hai — bilkul
 * jaise tum kisi ka reply karte ho.
 *
 *   const { replyQuote, getQuotedText } = require("./reply-quote.cjs");
 *
 *   // User ke message ka reply (quote box sameet):
 *   await replyQuote(sock, msg, "Samajh gaya! ✅");
 *
 *   // User ne kis message ka reply kiya tha, wo text nikalo:
 *   const q = getQuotedText(msg); // "pichla message" ya null
 */

async function replyQuote(sock, msg, text, extra = {}) {
    await sock.sendMessage(
        msg.key.remoteJid,
        { text, ...extra },
        { quoted: msg }   // <-- yehi quote box banata hai
    );
}

/** Attachment ke saath reply-quote */
async function replyQuoteMedia(sock, msg, content) {
    await sock.sendMessage(
        msg.key.remoteJid,
        content,
        { quoted: msg }
    );
}

/**
 * Agar user ne kisi message ka reply kiya tha,
 * to us original message ka text nikalo.
 */
function getQuotedText(msg) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo
        || msg.message?.imageMessage?.contextInfo
        || msg.message?.videoMessage?.contextInfo;
    if (!ctx?.quotedMessage) return null;
    const qm = ctx.quotedMessage;
    return qm.conversation
        || qm.extendedTextMessage?.text
        || qm.imageMessage?.caption
        || qm.videoMessage?.caption
        || "[media message]";
}

function getQuotedSender(msg) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    return ctx?.participant || null; // group mein kis ka reply tha
}

module.exports = { replyQuote, replyQuoteMedia, getQuotedText, getQuotedSender };

/* demo */
if (require.main === module) {
    (async () => {
        const sent = [];
        const sock = {
            sendMessage: async (jid, content, opts) => {
                sent.push({ jid, content, quoted: !!opts?.quoted });
            },
        };
        const fakeMsg = {
            key: { remoteJid: "123@s.whatsapp.net" },
            message: { conversation: "hello bot" },
        };
        await replyQuote(sock, fakeMsg, "Hello wapis! 👋");
        console.log("✅ reply bheja:", JSON.stringify(sent[0]));

        const replyMsg = {
            message: {
                extendedTextMessage: {
                    text: "acha!",
                    contextInfo: {
                        participant: "456@s.whatsapp.net",
                        quotedMessage: { conversation: "tum kaise ho?" },
                    },
                },
            },
        };
        console.log("✅ quoted text:", getQuotedText(replyMsg));
        console.log("✅ quoted sender:", getQuotedSender(replyMsg));
    })();
}
