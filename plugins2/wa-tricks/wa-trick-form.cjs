/**
 * wa-trick-form.cjs — Entry Form (2 tareeqe) 📋
 * ==============================================
 *
 * PART A — Conversational form (AAJ kaam karta hai ✅):
 *   Bot ek-ek karke sawal poochta hai, jawab validate karta hai,
 *   akhir mein summary bhejta hai + form-submissions.jsonl mein save.
 *
 *   WIRING:
 *     const { startForm, handleFormMessage } = require("./wa-trick-form.cjs");
 *
 *     // command: -form
 *     if (text === "-form") { await startForm(sock, from, msg); return; }
 *
 *     // handler mein commands se PEHLE:
 *     if (await handleFormMessage(sock, msg)) return; // form ne kha liya
 *
 * PART B — Native WhatsApp Flows (business setup chahiye 🏢):
 *   Neeche tafseel dekho. Aam bot number se NAHI hoga.
 */

const fs = require("fs");
const path = require("path");

/* ---------- submissions file (demo mein override ho sakta hai) ---------- */
let SUBMISSIONS_FILE = path.join(__dirname, "form-submissions.jsonl");
function setSubmissionsFile(p) { SUBMISSIONS_FILE = p; }

/* ==================== PART A — CONVERSATIONAL FORM ==================== */

// Har step: key, sawal, aur validate function.
// validate: true = OK, string = error message (dobara poocho).
const FORM_STEPS = [
    {
        key: "name",
        question: "📝 *Step 1/3*\nApna naam likho:",
        validate: (v) => v.length >= 2 || "Naam kam az kam 2 harf ka ho.",
    },
    {
        key: "phone",
        question: "📱 *Step 2/3*\nPhone number likho (misal: +923001234567):",
        validate: (v) => /^\+?\d{10,15}$/.test(v) || "Sahi phone number likho (10-15 digits).",
    },
    {
        key: "city",
        question: "🏙️ *Step 3/3*\nApna city likho:",
        validate: (v) => v.length >= 2 || "City ka naam likho.",
    },
];

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minute expiry
const sessions = new Map(); // remoteJid -> { stepIndex, answers, startedAt }

function sweepSessions() {
    const now = Date.now();
    for (const [k, s] of sessions) {
        if (now - s.startedAt > SESSION_TTL_MS) sessions.delete(k);
    }
}

function getText(msg) {
    return (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
    ).trim();
}

/** Form shuru karo: pehla sawal bhejo */
async function startForm(sock, from, quotedMsg = null) {
    sweepSessions();
    sessions.set(from, { stepIndex: 0, answers: {}, startedAt: Date.now() });
    await sock.sendMessage(
        from,
        { text: `📋 *Form shuru!*\n_(beech mein chhorne ke liye "cancel" likho)_\n\n${FORM_STEPS[0].question}` },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

/**
 * Har incoming message par chalao (commands se PEHLE).
 * true = message form ne consume kar liya (aage mat bhejo)
 * false = koi active form nahi (normal flow chalao)
 */
async function handleFormMessage(sock, msg) {
    sweepSessions();
    const from = msg.key?.remoteJid;
    const session = sessions.get(from);
    if (!session) return false;

    const text = getText(msg);
    if (!text) return false; // text nahi (sticker/photo) -> form consume na kare

    // cancel
    if (text.toLowerCase() === "cancel") {
        sessions.delete(from);
        await sock.sendMessage(from, { text: "❌ Form cancel kar diya." }, { quoted: msg });
        return true;
    }

    const step = FORM_STEPS[session.stepIndex];
    const res = step.validate(text);

    // invalid -> error + wahi sawal dobara
    if (res !== true) {
        await sock.sendMessage(
            from,
            { text: `⚠️ ${res}\n\n${step.question}\n_(cancel ke liye "cancel" likho)_` },
            { quoted: msg }
        );
        return true;
    }

    // valid -> save + agla step
    session.answers[step.key] = text;
    session.stepIndex++;

    if (session.stepIndex < FORM_STEPS.length) {
        const next = FORM_STEPS[session.stepIndex];
        await sock.sendMessage(from, { text: next.question }, { quoted: msg });
        return true;
    }

    // mukammal -> summary + file mein save
    sessions.delete(from);
    const line = JSON.stringify({
        at: new Date().toISOString(),
        from,
        ...session.answers,
    });
    fs.appendFileSync(SUBMISSIONS_FILE, line + "\n");

    const summary = Object.entries(session.answers)
        .map(([k, v]) => `• *${k}:* ${v}`)
        .join("\n");
    await sock.sendMessage(
        from,
        { text: `✅ *Form mukammal!*\n\n${summary}\n\nShukriya! 🙏` },
        { quoted: msg }
    );
    return true;
}

function activeForms() {
    sweepSessions();
    return sessions.size;
}

/* ==================== PART B — NATIVE WHATSAPP FLOWS ====================
 *
 * WhatsApp "Flows" = asal native form UI (text fields, dropdowns,
 * date picker, submit button) jo chat ke andar khulta hai.
 *
 * ⚠️ ZAROORI SHARAYET (in ke baghair NAHI hoga):
 *  1. Meta Business / WhatsApp Business API account (Cloud API).
 *     Aam phone-number bot (Baileys multi-device) se Flows
 *     publish/host NAHI hote.
 *  2. Meta "Flows Manager" mein Flow banao (drag-drop builder ya JSON),
 *     PUBLISH karo -> tumhe `flowId` milta hai.
 *  3. Flow ke liye `flowToken` (encryption/data token) generate karo.
 *  4. Phir CTA message bhejo jo Flow kholta hai.
 *
 * Baileys forks mein aam tor par ye shape hoti hai (fork ke hisab
 * se naam mukhtalif ho sakta hai — apne fork ki README dekho):
 *
 *   await sock.sendWhatsAppFlow(jid, {
 *       flowId: "1234567890",     // Flows Manager se published Flow ID
 *       flowToken: "xxxx",        // tumhara flow token
 *       cta: "📋 Form Bharo",     // button ka text
 *       text: "Neeche button dabao aur form bharo.",
 *   });
 *
 *  Ya "mini-app / flow mode" interactive message ke zariye.
 *
 * NOTE: Ye stub sirf samjhane ke liye hai — asal bhejna business
 * config ke baghair mumkin nahi, isi liye ye helpful error throw
 * karta hai.
 */
function sendFlowCTA(sock, jid, { flowId, flowToken, cta, text } = {}) {
    throw new Error(
        "wa-trick-form (PART B): Native WhatsApp Flow bhejne ke liye chahiye:\n" +
        "  1) Meta Flows Manager mein PUBLISHED Flow (flowId)\n" +
        "  2) flowToken\n" +
        "  3) WhatsApp Business API / Cloud API number (aam Baileys bot number se nahi hoga)\n" +
        "Tafseel ke liye is file mein PART B ka comment block parho.\n" +
        `Mila: flowId=${flowId || "—"}, flowToken=${flowToken ? "****" : "—"}`
    );
}

module.exports = {
    FORM_STEPS,
    startForm,
    handleFormMessage,
    activeForms,
    sendFlowCTA,
    setSubmissionsFile,
    _sessions: sessions, // tests ke liye
};

/* ================= MOCK DEMO TEST ================= */
if (require.main === module) {
    (async () => {
        const os = require("os");
        const demoFile = path.join(os.tmpdir(), "form-demo-test.jsonl");
        try { fs.unlinkSync(demoFile); } catch {}
        setSubmissionsFile(demoFile);

        const sent = [];
        const sock = {
            sendMessage: async (jid, content, opts) => {
                sent.push({ jid, text: content.text, quoted: !!opts?.quoted });
            },
        };
        const from = "123@s.whatsapp.net";
        const mkMsg = (text) => ({
            key: { remoteJid: from },
            message: text === null ? { stickerMessage: {} } : { conversation: text },
        });

        console.log("--- 1. Koi session nahi -> false ---");
        console.log("✅ consumed:", await handleFormMessage(sock, mkMsg("hello")), "(false hona chahiye)");

        console.log("\n--- 2. Form start ---");
        await startForm(sock, from, null);
        console.log("✅ sawal bheja:", JSON.stringify(sent.at(-1).text.slice(0, 40) + "..."));
        console.log("✅ active forms:", activeForms());

        console.log("\n--- 3. Ghalat naam (retry) ---");
        console.log("✅ consumed:", await handleFormMessage(sock, mkMsg("a")));
        console.log("✅ error bheja:", sent.at(-1).text.includes("⚠️"));

        console.log("\n--- 4. Sahi naam ---");
        await handleFormMessage(sock, mkMsg("Ali Raza"));
        console.log("✅ agla sawal:", sent.at(-1).text.includes("Step 2/3"));

        console.log("\n--- 5. Ghalat phone (retry) ---");
        await handleFormMessage(sock, mkMsg("123"));
        console.log("✅ error bheja:", sent.at(-1).text.includes("⚠️"));

        console.log("\n--- 6. Sahi phone ---");
        await handleFormMessage(sock, mkMsg("+923001234567"));
        console.log("✅ agla sawal:", sent.at(-1).text.includes("Step 3/3"));

        console.log("\n--- 7. City -> complete ---");
        await handleFormMessage(sock, mkMsg("Lahore"));
        console.log("✅ summary:", sent.at(-1).text.includes("Form mukammal"));
        console.log("✅ active forms:", activeForms(), "(0 hona chahiye)");

        const lines = fs.readFileSync(demoFile, "utf8").trim().split("\n");
        const saved = JSON.parse(lines[0]);
        console.log("✅ jsonl saved:", saved.name === "Ali Raza" && saved.phone === "+923001234567" && saved.city === "Lahore");

        console.log("\n--- 8. Cancel flow ---");
        await startForm(sock, from, null);
        console.log("✅ consumed:", await handleFormMessage(sock, mkMsg("cancel")));
        console.log("✅ cancel msg:", sent.at(-1).text.includes("cancel"));
        console.log("✅ active forms:", activeForms(), "(0 hona chahiye)");

        console.log("\n--- 9. PART B stub ---");
        try {
            sendFlowCTA(sock, from, {});
        } catch (e) {
            console.log("✅ helpful error:", JSON.stringify(e.message.split("\n")[0]));
        }

        fs.unlinkSync(demoFile);
        console.log("\n📋 form demo complete.");
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
