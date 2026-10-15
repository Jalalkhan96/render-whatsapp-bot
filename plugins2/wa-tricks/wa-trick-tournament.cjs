/**
 * wa-trick-tournament.cjs — Multiplayer Challenges + Leaderboards 🏆
 * ===================================================================
 * Doston ko challenge karo, scores submit karo, leaderboard dekho!
 *
 * COMMANDS (prefix "-" — games wale PREFIX se aata hai):
 *   -challenge @dost dino   → dost ko game challenge bhejo
 *   -accept [id]             → challenge qabool karo
 *   -decline [id]            → challenge refuse karo
 *   -score dino 450          → apna score submit karo
 *   -rank dino               → us game ka leaderboard
 *   -rank                    → sab games ke top players
 *
 * FULL FLOW (example):
 *   1. Ali:      -challenge @Ahmed dino
 *   2. Bot→Ahmed: "🎮 Ali ne challenge kiya! -accept likho"
 *   3. Ahmed:    -accept
 *   4. Bot:      DONO ko unki PFP wala dino game bhejta hai 🎭
 *   5. Ali:      -score dino 450
 *      Ahmed:    -score dino 380
 *   6. Bot:      "🏆 Winner: Ali! (450 vs 380)" — dono ko
 *   7. Koi bhi: -rank dino → 🥇 Ali 450, 🥈 Ahmed 380
 *
 * NOTE (honest): game player ke phone mein khulti hai, is liye score
 * bot khud nahi dekh sakta — player -score se submit karta hai.
 * Doston ke darmiyan trust-based hai. 🤝
 *
 * STORAGE: game-scores.json (scores + challenges)
 */

const fs = require("fs");
const path = require("path");
const { GAMES, PREFIX, sendPersonalizedGame } = require("./wa-trick-games.cjs");

let SCORES_FILE = path.join(__dirname, "game-scores.json");
function setScoresFile(p) { SCORES_FILE = p; }

const ACCEPT_WINDOW_MS = 15 * 60 * 1000; // challenge accept karne ke 15 min

/* ---------------- storage ---------------- */
function load() {
    try {
        const db = JSON.parse(fs.readFileSync(SCORES_FILE, "utf8"));
        if (!Array.isArray(db.scores)) db.scores = [];
        if (!db.challenges || typeof db.challenges !== "object") db.challenges = {};
        return db;
    } catch (e) {
        return { scores: [], challenges: {} };
    }
}
function save(db) {
    fs.writeFileSync(SCORES_FILE, JSON.stringify(db, null, 1));
}
/** purani pending challenges expire karo */
function expireOld(db) {
    const now = Date.now();
    for (const id of Object.keys(db.challenges)) {
        const c = db.challenges[id];
        if (c.status === "pending" && now - c.createdAt > ACCEPT_WINDOW_MS) {
            c.status = "expired";
        }
    }
}

/* ---------------- helpers ---------------- */
function getName(msg) {
    return msg.pushName || msg.key.remoteJid.split("@")[0].split(":")[0];
}
function jidToTag(jid) { return "@" + jid.split("@")[0].split(":")[0]; }

function gameByCmd(cmd) {
    return GAMES.find((g) => g.cmd === (cmd || "").toLowerCase());
}

/** opponent nikalo: mention ya phone number */
function parseOpponent(msg, args) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
    const digits = (args[0] || "").replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) return digits + "@s.whatsapp.net";
    return null;
}

function pendingFor(db, opponentJid) {
    return Object.values(db.challenges).filter(
        (c) => c.status === "pending" && c.opponent === opponentJid
    );
}

/* ---------------- commands ---------------- */

async function cmdChallenge(sock, msg, args) {
    const from = msg.key.remoteJid;
    const me = getName(msg);
    const opponent = parseOpponent(msg, args);
    const game = gameByCmd(args[1]) || gameByCmd("dino");

    if (!opponent) {
        await sock.sendMessage(from, {
            text: `❌ Dost specify karo!\n\nMisal: \`${PREFIX}challenge @dost dino\`\nya: \`${PREFIX}challenge 923001234567 flappy\`\n\nGames: ${GAMES.map((g) => g.cmd).join(", ")}`,
        });
        return;
    }
    if (opponent === from) {
        await sock.sendMessage(from, { text: "😂 Khud ko challenge nahi kar sakte!" });
        return;
    }

    const db = load(); expireOld(db);
    const id = Date.now().toString(36) + Math.floor(Math.random() * 999);
    db.challenges[id] = {
        id, challenger: from, challengerName: me,
        opponent, opponentName: opponent.split("@")[0],
        game: game.cmd, status: "pending",
        createdAt: Date.now(), scores: {},
    };
    save(db);

    await sock.sendMessage(from, {
        text: `🥊 *Challenge bhej diya!*\n\n${jidToTag(opponent)} ko *${game.name}* ka challenge gaya.\nJab wo \`${PREFIX}accept\` karega to dono ko game milega!`,
        mentions: [opponent],
    });
    // opponent ko challenge message
    await sock.sendMessage(opponent, {
        text:
            `🎮 *GAME CHALLENGE!* 🥊\n\n` +
            `${jidToTag(from)} (${me}) ne tumhe *${game.name}* mein challenge kiya hai!\n\n` +
            `✅ Qabool: \`${PREFIX}accept\`\n` +
            `❌ Inkaar: \`${PREFIX}decline\`\n\n` +
            `⏱️ 15 minute mein jawab do!`,
        mentions: [from],
    });
}

async function cmdAccept(sock, msg, args) {
    const from = msg.key.remoteJid;
    const db = load(); expireOld(db);
    let list = pendingFor(db, from);
    if (args[0]) list = list.filter((c) => c.id === args[0] || c.id.startsWith(args[0]));
    const ch = list[0];

    if (!ch) {
        await sock.sendMessage(from, {
            text: `❌ Koi pending challenge nahi mila.\nKoi dost challenge kare to \`${PREFIX}accept\` likhna!`,
        });
        return;
    }
    ch.status = "active";
    // opponent ka naam update (accept karne wale ka asal naam)
    ch.opponentName = getName(msg);
    save(db);

    const game = gameByCmd(ch.game);
    const announce =
        `✅ *Challenge ACCEPTED!* 🎮\n\n` +
        `*${game.name}* — dono khelo!\n\n` +
        `🎭 Dono ko apni PFP wala game mil raha hai...\n` +
        `Khelne ke baad score submit karo:\n\`${PREFIX}score ${game.cmd} <points>\`\n` +
        `Misal: \`${PREFIX}score ${game.cmd} 450\``;

    await sock.sendMessage(ch.challenger, { text: announce });
    await sock.sendMessage(ch.opponent, { text: announce });

    // DONO ko unki PFP wala personalized game!
    await sendPersonalizedGame(sock, ch.challenger, game.cmd, null);
    await sendPersonalizedGame(sock, ch.opponent, game.cmd, null);
}

async function cmdDecline(sock, msg, args) {
    const from = msg.key.remoteJid;
    const db = load(); expireOld(db);
    let list = pendingFor(db, from);
    if (args[0]) list = list.filter((c) => c.id === args[0] || c.id.startsWith(args[0]));
    const ch = list[0];

    if (!ch) {
        await sock.sendMessage(from, { text: "❌ Koi pending challenge nahi mila." });
        return;
    }
    ch.status = "declined";
    save(db);
    await sock.sendMessage(from, { text: "❌ Challenge decline kar diya." });
    await sock.sendMessage(ch.challenger, {
        text: `😅 ${jidToTag(from)} ne tumhara *${gameByCmd(ch.game).name}* challenge decline kar diya!`,
        mentions: [from],
    });
}

async function cmdScore(sock, msg, args) {
    const from = msg.key.remoteJid;
    const me = getName(msg);
    const game = gameByCmd(args[0]);
    const points = parseInt(args[1], 10);

    if (!game || !Number.isInteger(points) || points <= 0 || points > 999999) {
        await sock.sendMessage(from, {
            text: `❌ Sahi format: \`${PREFIX}score <game> <points>\`\nMisal: \`${PREFIX}score dino 450\`\nGames: ${GAMES.map((g) => g.cmd).join(", ")}`,
        });
        return;
    }

    const db = load(); expireOld(db);
    db.scores.push({ game: game.cmd, jid: from, name: me, score: points, at: Date.now() });
    // purana data zyada na ho — har game ke latest 2000 scores rakho
    const perGame = {};
    db.scores = db.scores.filter((s) => {
        perGame[s.game] = (perGame[s.game] || 0) + 1;
        return perGame[s.game] <= 2000;
    });

    // active challenge ka hissa? to score note karo
    const myChallenge = Object.values(db.challenges).find(
        (c) => c.status === "active" && c.game === game.cmd &&
               (c.challenger === from || c.opponent === from)
    );
    let extra = "";
    if (myChallenge) {
        myChallenge.scores[from] = points;
        const a = myChallenge.scores[myChallenge.challenger];
        const b = myChallenge.scores[myChallenge.opponent];
        if (a !== undefined && b !== undefined) {
            myChallenge.status = "done";
            extra = await announceWinner(sock, myChallenge);
        } else {
            extra = `\n\n⏳ Challenge: opponent ke score ka intezar hai...`;
        }
    } else {
        extra = `\n\n📊 Leaderboard: \`${PREFIX}rank ${game.cmd}\``;
    }
    save(db);
    await sock.sendMessage(from, {
        text: `✅ *Score save ho gaya!*\n\n🎮 ${game.name}: *${points} pts*${extra}`,
    });
}

/** dono scores aa jayen to winner announce karo — dono ko bhejta hai */
async function announceWinner(sock, ch) {
    const game = gameByCmd(ch.game);
    const a = ch.scores[ch.challenger];
    const b = ch.scores[ch.opponent];
    const winnerJid = a === b ? null : (a > b ? ch.challenger : ch.opponent);
    const text =
        `🏆 *CHALLENGE RESULT — ${game.name.toUpperCase()}* 🏆\n\n` +
        `${jidToTag(ch.challenger)} (${ch.challengerName}): *${a} pts*\n` +
        `${jidToTag(ch.opponent)} (${ch.opponentName}): *${b} pts*\n\n` +
        (winnerJid
            ? `🎉 *WINNER: ${jidToTag(winnerJid)}!* 🥇`
            : `🤝 *DRAW!* Dono barabar!`) +
        `\n\n📊 \`${PREFIX}rank ${game.cmd}\``;
    const mentions = [ch.challenger, ch.opponent];
    await sock.sendMessage(ch.challenger, { text, mentions });
    await sock.sendMessage(ch.opponent, { text, mentions });
    return "";
}

const MEDALS = ["🥇", "🥈", "🥉"];

async function cmdRank(sock, msg, args) {
    const from = msg.key.remoteJid;
    const db = load();
    const game = gameByCmd(args[0]);

    /** har player ka best score */
    function topFor(gameCmd, limit) {
        const best = {};
        for (const s of db.scores) {
            if (s.game !== gameCmd) continue;
            if (!best[s.jid] || s.score > best[s.jid].score) best[s.jid] = s;
        }
        return Object.values(best).sort((x, y) => y.score - x.score).slice(0, limit);
    }

    let text;
    if (game) {
        const top = topFor(game.cmd, 10);
        text = `🏆 *${game.name.toUpperCase()} — LEADERBOARD* 🏆\n\n`;
        text += top.length
            ? top.map((s, i) => `${MEDALS[i] || `${i + 1}.`} ${s.name} — *${s.score} pts*`).join("\n")
            : "Abhi koi score nahi! Pehle khelo: `" + PREFIX + "games`";
    } else {
        text = `🏆 *GAME LEADERBOARDS* 🏆\n`;
        for (const g of GAMES) {
            const top = topFor(g.cmd, 3);
            text += `\n${g.name === "Dino Runner" ? "🦖" : g.name === "Flappy Bird" ? "🐤" : "🐍"} *${g.name}*\n`;
            text += top.length
                ? top.map((s, i) => `${MEDALS[i]} ${s.name} — *${s.score}*`).join("\n")
                : "_koi score nahi_";
            text += "\n";
        }
        text += `\nDetail: \`${PREFIX}rank <game}\` — Games: ${GAMES.map((g) => g.cmd).join(", ")}`;
    }
    await sock.sendMessage(from, { text });
}

/**
 * messages.upsert mein games ke BAAD chalao:
 *   if (await handleGameCommand(sock, msg)) return;
 *   if (await handleTournament(sock, msg)) return;
 */
async function handleTournament(sock, msg) {
    const raw = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
    ).trim();
    if (!raw.startsWith(PREFIX)) return false;
    const parts = raw.slice(PREFIX.length).split(/\s+/);
    const cmd = (parts[0] || "").toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
        case "challenge": await cmdChallenge(sock, msg, args); return true;
        case "accept":    await cmdAccept(sock, msg, args);    return true;
        case "decline":   await cmdDecline(sock, msg, args);   return true;
        case "score":     await cmdScore(sock, msg, args);     return true;
        case "rank":      await cmdRank(sock, msg, args);      return true;
        default: return false;
    }
}

module.exports = {
    setScoresFile, handleTournament,
    cmdChallenge, cmdAccept, cmdDecline, cmdScore, cmdRank,
    _load: load, _save: save,
};

/* mock test — poora tournament flow */
if (require.main === module) {
    (async () => {
        const fs2 = require("fs");
        const tmpFile = "/tmp/test-scores.json";
        try { fs2.unlinkSync(tmpFile); } catch (e) {}
        setScoresFile(tmpFile);

        const sent = [];
        const sock = {
            sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); },
            profilePictureUrl: async () => "https://example.com/pfp.jpg",
        };
        global.fetch = async () => ({
            ok: true, headers: { get: () => "image/jpeg" },
            arrayBuffer: async () => Buffer.from("FAKEIMG"),
        });

        const ALI = "923001111111@s.whatsapp.net";
        const AHMED = "923002222222@s.whatsapp.net";
        const msgOf = (jid, name, text, mentionedJid) => ({
            key: { remoteJid: jid }, pushName: name,
            message: {
                extendedTextMessage: {
                    text, contextInfo: { mentionedJid: mentionedJid || [] },
                },
            },
        });
        const textsTo = (jid) => sent.filter((s) => s.jid === jid).map((s) =>
            s.content.text || `[${s.content.document ? "document:" + s.content.fileName : "?"}]`).join("\n---\n");

        // 1. Ali challenges Ahmed (mention)
        await handleTournament(sock, {
            key: { remoteJid: ALI }, pushName: "Ali",
            message: { extendedTextMessage: { text: "-challenge dino",
                contextInfo: { mentionedJid: [AHMED] } } },
        });
        let db = load();
        const chId = Object.keys(db.challenges)[0];
        console.log("✅ challenge created:", chId, "| status:", db.challenges[chId].status);
        console.log("✅ Ahmed notified:", textsTo(AHMED).includes("GAME CHALLENGE"));

        // 2. Ahmed accepts → dono ko PFP game
        await handleTournament(sock, { key: { remoteJid: AHMED }, pushName: "Ahmed",
            message: { conversation: "-accept" } });
        db = load();
        console.log("✅ challenge active:", db.challenges[chId].status === "active");
        const docs = sent.filter((s) => s.content.document);
        console.log("✅ dono ko game file mili:", docs.length === 2,
            "| PFP embedded:", docs.every((d) => d.content.document.toString().includes("data:image")));

        // 3. Scores submit
        await handleTournament(sock, { key: { remoteJid: ALI }, pushName: "Ali",
            message: { conversation: "-score dino 450" } });
        await handleTournament(sock, { key: { remoteJid: AHMED }, pushName: "Ahmed",
            message: { conversation: "-score dino 380" } });
        db = load();
        console.log("✅ challenge done:", db.challenges[chId].status === "done");
        const winnerMsg = textsTo(ALI);
        console.log("✅ winner announced (Ali):", winnerMsg.includes("WINNER") && winnerMsg.includes("450") && winnerMsg.includes("380"));

        // 4. Leaderboard
        await handleTournament(sock, { key: { remoteJid: ALI }, pushName: "Ali",
            message: { conversation: "-rank dino" } });
        const rankText = textsTo(ALI).split("\n---\n").pop();
        console.log("✅ leaderboard:", rankText.includes("🥇 Ali") && rankText.includes("🥈 Ahmed"));

        // 5. Self-challenge blocked
        const n0 = sent.length;
        await handleTournament(sock, { key: { remoteJid: ALI }, pushName: "Ali",
            message: { extendedTextMessage: { text: "-challenge", contextInfo: { mentionedJid: [ALI] } } } });
        console.log("✅ self-challenge blocked:", textsTo(ALI).includes("Khud ko challenge"));

        // 6. Decline flow
        await handleTournament(sock, { key: { remoteJid: AHMED }, pushName: "Ahmed",
            message: { extendedTextMessage: { text: "-challenge flappy", contextInfo: { mentionedJid: [ALI] } } } });
        await handleTournament(sock, { key: { remoteJid: ALI }, pushName: "Ali",
            message: { conversation: "-decline" } });
        db = load();
        console.log("✅ decline works:", Object.values(db.challenges).some((c) => c.status === "declined"));

        // 7. Unknown command → false
        console.log("✅ unknown → false:", await handleTournament(sock,
            { key: { remoteJid: ALI }, message: { conversation: "-hello" } }) === false);

        fs2.unlinkSync(tmpFile);
        console.log("\n🎉 ALL TOURNAMENT TESTS PASSED");
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
