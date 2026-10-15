/**
 * tap-reveal.cjs — DIY Tap-to-Reveal Spoiler System 🔒👁️
 * ======================================================
 * WhatsApp mein native spoiler NAHI hai, to hum khud banate hain!
 *
 * FLOW (3 steps):
 *   1. LOCK   — Bot "🔒 Hidden" message + [👁️ Reveal] button bhejta hai
 *   2. TAP    — User button dabata hai (ya 4-harf ka code bhejta hai)
 *   3. REVEAL — Bot secret text bhej deta hai (one-time ya reusable)
 *
 * WIRING (apne main handler mein sab se UPAR lagao):
 *
 *   const { handleTapReveal } = require("./tap-reveal.cjs");
 *   sock.ev.on("messages.upsert", async ({ messages }) => {
 *       const msg = messages[0];
 *       if (!msg.message) return;
 *       if (await handleTapReveal(sock, msg)) return; // 👈 tap pakda gaya
 *       // ... yahan baqi commands
 *   });
 *
 * COMMAND EXAMPLE (-hide):
 *
 *   const { sendTapToReveal } = require("./tap-reveal.cjs");
 *   // -hide ye mera secret hai
 *   await sendTapToReveal(sock, from, args.join(" "), {}, msg);
 */

const crypto = require("crypto");

/* code -> { text, reusable, createdAt, ttlMs } */
const store = new Map();

function newCode() {
    return crypto.randomBytes(2).toString("hex"); // 4 harf, misal: a3f9
}

function sweep() {
    const now = Date.now();
    for (const [code, e] of store) {
        if (now - e.createdAt > e.ttlMs) store.delete(code);
    }
}

/**
 * Locked spoiler message bhejo.
 * opts: { title, hint, reusable=false, ttlMs=10min, footer }
 */
async function sendTapToReveal(sock, from, hiddenText, opts = {}, quotedMsg = null) {
    const {
        title = "🔒 *Hidden Message*",
        hint = "Dekhne ke liye neeche dabao 👇",
        reusable = false,
        ttlMs = 10 * 60 * 1000,
        footer = "Tap to Reveal",
    } = opts;

    const code = newCode();
    sweep();
    store.set(code, { text: hiddenText, reusable, createdAt: Date.now(), ttlMs });

    await sock.sendMessage(from, {
        text: `${title}\n${hint}\n\n🔑 Code: \`${code}\` _(button na dikhe to ye code bhejo)_`,
        footer,
        buttons: [
            { buttonId: `rvl_${code}`, buttonText: { displayText: "👁️ Reveal" }, type: 1 },
        ],
        headerType: 1,
    }, quotedMsg ? { quoted: quotedMsg } : {});

    return code;
}

/** Message mein se reveal tap/code nikalo */
function extractTap(msg) {
    // 1. Button tap
    const btn = msg.message?.buttonsResponseMessage?.selectedButtonId;
    if (btn && btn.startsWith("rvl_")) return btn.slice(4).toLowerCase();
    // 2. Text mein code (misal: "a3f9" ya "reveal a3f9")
    const t = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text || "";
    const m = t.trim().match(/^(?:reveal\s+)?([0-9a-f]{4})$/i);
    return m ? m[1].toLowerCase() : null;
}

/**
 * Har incoming message par chalao.
 * Agar ye reveal tap tha to secret bhej kar true return karta hai.
 */
async function handleTapReveal(sock, msg) {
    const code = extractTap(msg);
    if (!code || !store.has(code)) return false;

    const entry = store.get(code);
    if (Date.now() - entry.createdAt > entry.ttlMs) {
        store.delete(code);
        return false;
    }
    if (!entry.reusable) store.delete(code); // one-time reveal

    await sock.sendMessage(
        msg.key.remoteJid,
        { text: `👁️ *Revealed:*\n\n${entry.text}` },
        { quoted: msg }
    );
    return true;
}

/** Kitne active locks hain (debug) */
function activeLocks() {
    sweep();
    return store.size;
}

module.exports = {
    sendTapToReveal, handleTapReveal, extractTap, activeLocks,
    _store: store, // tests ke liye
};

/* demo test */
if (require.main === module) {
    (async () => {
        const sent = [];
        const sock = {
            sendMessage: async (jid, content, opts) => {
                sent.push({ jid, content, opts });
            },
        };
        const from = "123@s.whatsapp.net";

        // 1. LOCK
        const code = await sendTapToReveal(sock, from, "ye secret answer hai 🤫");
        console.log("✅ lock bheja, code:", code);
        console.log("   button id:", sent[0].content.buttons[0].buttonId);

        // 2. TAP (button)
        const tapMsg = {
            key: { remoteJid: from },
            message: { buttonsResponseMessage: { selectedButtonId: `rvl_${code}` } },
        };
        console.log("✅ button tap ->", await handleTapReveal(sock, tapMsg));
        console.log("   revealed:", JSON.stringify(sent[1].content.text));

        // 3. Dobara tap (one-time -> fail hona chahiye)
        console.log("✅ dobara tap ->", await handleTapReveal(sock, tapMsg), "(false hona chahiye)");

        // 4. Text code fallback
        const code2 = await sendTapToReveal(sock, from, "dosra secret");
        const textMsg = {
            key: { remoteJid: from },
            message: { conversation: code2 },
        };
        console.log("✅ text code ->", await handleTapReveal(sock, textMsg));
        console.log("   active locks:", activeLocks(), "(0 hona chahiye)");
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
