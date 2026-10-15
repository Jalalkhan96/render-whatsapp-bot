/**
 * wa-trick-polls.cjs — Polls & Quiz 🗳️
 * =====================================
 * Native WhatsApp polls (bot se bhejo, votes ginwao) + quiz mode
 * (sahi/ghalat jawab ka faisla bot karta hai).
 *
 * USE:
 *   const { sendPoll, sendQuiz, handlePollVote } =
 *       require("./wa-trick-polls.cjs");
 *
 *   // command: -poll Sawal? | Option1 | Option2 | Option3
 *   await sendPoll(sock, from, {
 *       question: "Best shoe konsa?",
 *       options: ["Red", "Blue", "Black"],
 *   }, msg);
 *
 *   // command: -quiz Pakistan ka capital? | Lahore | Karachi | Islamabad
 *   // (sahi jawab ka index: 2)
 *   const quizzes = new Map();
 *   await sendQuiz(sock, from, {
 *       question: "Pakistan ka capital?",
 *       options: ["Lahore", "Karachi", "Islamabad"],
 *       correctIndex: 2,
 *   }, quizzes, msg);
 *
 *   // handler mein (poll updates ke liye):
 *   if (await handlePollVote(sock, msg, quizzes)) return;
 *
 * ⚠️ SUCH (imandaari se):
 *  - WhatsApp mein NATIVE "correct answer" marking NAHI hai —
 *    quiz ka faisla bot khud karta hai (neeche handlePollVote).
 *  - Vote ki decryption sirf un polls ke liye reliable hai jo
 *    BOT NE KHUD banaye hon. Dosron ke polls ke votes parhna
 *    unreliable hai — is par bharosa mat karo.
 *  - Poll mein 2 se 12 options (WhatsApp limit).
 */

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 12;

function validatePoll({ question, options }) {
    if (!question || !question.trim()) {
        throw new Error("sendPoll: question khali hai.");
    }
    if (!Array.isArray(options) || options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
        throw new Error(
            `sendPoll: options ${MIN_OPTIONS}-${MAX_OPTIONS} hone chahiye (mile: ${options ? options.length : 0}).`
        );
    }
    // NOTE: WhatsApp option text ki length limit rakhta hai; lambi
    // options se bacho. Exact cap UNVERIFIED hai — 100 chars se neeche
    // rakhna mehfooz tareeqa hai (live test karo).
    for (const o of options) {
        if (typeof o !== "string" || !o.trim()) {
            throw new Error("sendPoll: har option ghair-khali text ho.");
        }
        if (o.length > 100) {
            throw new Error(`sendPoll: option bohat lambi hai (100 chars se kam rakho): "${o.slice(0, 30)}..."`);
        }
    }
}

/**
 * Native poll bhejo.
 * opts = { question, options, multi=false }
 * multi=true -> voter multiple options chun sakta hai
 */
async function sendPoll(sock, from, { question, options, multi = false }, quotedMsg = null) {
    validatePoll({ question, options });
    const sent = await sock.sendMessage(
        from,
        {
            poll: {
                name: question,
                values: options,
                selectableCount: multi ? options.length : 1,
            },
        },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
    return sent; // sent.key.id -> baad mein pehchan ke liye
}

/**
 * Quiz poll bhejo — bot sahi jawab yaad rakhta hai.
 * quizzes = Map (pollName -> { correctIndex, options, from, createdAt, creationId })
 * NOTE: WhatsApp khud "sahi jawab" mark nahi karta; faisla
 * handlePollVote mein bot karta hai.
 */
async function sendQuiz(sock, from, { question, options, correctIndex }, quizzes, quotedMsg = null) {
    validatePoll({ question, options });
    if (
        typeof correctIndex !== "number" ||
        correctIndex < 0 ||
        correctIndex >= options.length
    ) {
        throw new Error(
            `sendQuiz: correctIndex 0-${options.length - 1} ke darmiyan ho (mila: ${correctIndex}).`
        );
    }
    const sent = await sendPoll(sock, from, { question, options }, quotedMsg);
    const creationId = sent?.key?.id || null;
    const quiz = {
        name: question,
        options,
        correctIndex,
        correctAnswer: options[correctIndex],
        from,
        createdAt: Date.now(),
        creationId,
    };
    quizzes.set(question, quiz); // naam se match (neeche dekho)
    if (creationId) {
        // creation message id -> naam ka index (reliable matching ke liye)
        quizzes.set(`__id:${creationId}`, question);
    }
    await sock.sendMessage(
        from,
        { text: `❓ *Quiz!* Sahi jawab chuno 👆\n_(bot jawab check karega)_` },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
    return quiz;
}

/** Poll update message mein se vote ki details nikalo */
function parsePollVote(msg) {
    const upd = msg.message?.pollUpdateMessage;
    if (!upd) return null;
    // Baileys bot-ke-banaye polls ke votes decrypt karke
    // vote.selectedOptions mein strings deta hai.
    const selected = upd.vote?.selectedOptions || [];
    return {
        creationKey: upd.pollCreationMessageKey || null, // original poll ka key
        selected: selected.map(String),
        voter: msg.key?.participant || msg.key?.remoteJid || "koi",
    };
}

/**
 * Poll vote aane par chalao. true = vote handle ho gaya.
 * quizzes = sendQuiz wala Map.
 *
 * Matching: pehle creation message id se (reliable), phir naam se.
 * (Poll update mein naam nahi aata, isi liye creationId index hai.)
 */
async function handlePollVote(sock, msg, quizzes) {
    const vote = parsePollVote(msg);
    if (!vote) return false;

    let quiz = null;
    const cid = vote.creationKey?.id;
    if (cid && quizzes.has(`__id:${cid}`)) {
        quiz = quizzes.get(quizzes.get(`__id:${cid}`));
    }
    // NOTE: sirf naam se match karna mumkin nahi kyunke poll update
    // mein poll ka naam nahi hota — isi liye upar creationId use hua.
    if (!quiz) return false;

    const from = msg.key?.remoteJid;
    const voterNum = String(vote.voter).split("@")[0].split(":")[0];
    const picked = vote.selected;

    if (picked.includes(quiz.correctAnswer)) {
        await sock.sendMessage(from, {
            text: `🎯 @${voterNum} *SAHI JAWAB!* ✅\n\n"${quiz.correctAnswer}" bilkul durust hai! 🎉`,
            mentions: [vote.voter],
        });
    } else if (picked.length > 0) {
        await sock.sendMessage(from, {
            text: `❌ @${voterNum} ghalat!\n\nTumhara jawab: "${picked.join(", ")}"\nDobara try karo! 💪`,
            mentions: [vote.voter],
        });
    }
    return true;
}

module.exports = {
    sendPoll,
    sendQuiz,
    handlePollVote,
    parsePollVote,
    MIN_OPTIONS,
    MAX_OPTIONS,
};

/* ================= MOCK DEMO TEST ================= */
if (require.main === module) {
    (async () => {
        const sent = [];
        let n = 0;
        const sock = {
            sendMessage: async (jid, content, opts) => {
                n++;
                const fake = { key: { id: `mock${n}`, remoteJid: jid, fromMe: true } };
                sent.push({ jid, content, fake });
                return fake;
            },
        };
        const from = "123@s.whatsapp.net";

        console.log("--- 1. Simple poll ---");
        await sendPoll(sock, from, {
            question: "Best shoe?",
            options: ["Red", "Blue", "Black"],
        });
        const p = sent.at(-1).content.poll;
        console.log("✅ poll name:", p.name, "| options:", p.values.length, "| selectable:", p.selectableCount);

        console.log("\n--- 2. Multi-select poll ---");
        await sendPoll(sock, from, {
            question: "Konse colors?",
            options: ["Red", "Blue"],
            multi: true,
        });
        console.log("✅ selectableCount:", sent.at(-1).content.poll.selectableCount, "(2 hona chahiye)");

        console.log("\n--- 3. Limits (1 option -> error) ---");
        try {
            await sendPoll(sock, from, { question: "Q?", options: ["Solo"] });
            console.log("❌ error nahi aaya!");
        } catch (e) {
            console.log("✅ error:", JSON.stringify(e.message));
        }

        console.log("\n--- 4. Quiz + votes ---");
        const quizzes = new Map();
        const quiz = await sendQuiz(sock, from, {
            question: "Pakistan ka capital?",
            options: ["Lahore", "Karachi", "Islamabad"],
            correctIndex: 2,
        }, quizzes);
        console.log("✅ quiz stored, correct:", quiz.correctAnswer);
        const creationId = "mock3"; // sendPoll wala mock id

        const mkVote = (who, picked) => ({
            key: { remoteJid: from, participant: `${who}@s.whatsapp.net`, fromMe: false },
            message: {
                pollUpdateMessage: {
                    pollCreationMessageKey: { id: creationId, remoteJid: from, fromMe: true },
                    vote: { selectedOptions: picked },
                },
            },
        });

        console.log("✅ sahi vote ->", await handlePollVote(sock, mkVote("92300111", ["Islamabad"]), quizzes));
        console.log("   elaan:", JSON.stringify(sent.at(-1).content.text.slice(0, 30) + "..."));
        console.log("✅ ghalat vote ->", await handlePollVote(sock, mkVote("92300222", ["Lahore"]), quizzes));
        console.log("   elaan:", JSON.stringify(sent.at(-1).content.text.slice(0, 30) + "..."));

        console.log("\n--- 5. Ghair-poll message -> false ---");
        console.log("✅ handled:", await handlePollVote(sock, { key: {}, message: { conversation: "hi" } }, quizzes), "(false)");

        console.log("\n--- 6. Ajnabi poll (bot ne nahi banaya) -> false ---");
        const strange = mkVote("92300333", ["X"]);
        strange.message.pollUpdateMessage.pollCreationMessageKey.id = "unknown999";
        console.log("✅ handled:", await handlePollVote(sock, strange, quizzes), "(false hona chahiye)");

        console.log("\n🗳️ polls demo complete.");
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
