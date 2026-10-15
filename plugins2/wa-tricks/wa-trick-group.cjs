/**
 * wa-trick-group.cjs — Group tricks for Baileys bots 👥
 * =======================================================
 * CommonJS only. Prefix used in examples: `-`
 *
 *   - mentionAll(sock, groupJid, text, participants)
 *   - welcomeHandler(sock) -> group-participants.update listener
 *   - containsLink(text)
 *   - sendInviteLink(sock, groupJid, to)
 *
 * ZIMMEDARI SE ISTEMAL KARO:
 *   mentionAll / broadcast jaisi cheezein spam flags trigger kar sakti
 *   hain. Sirf apne groups mein, zaroorat par istemal karo.
 */

/**
 * Sab ko mention karo (@all jaisa).
 * participants: array of JIDs, misal ["92xx@s.whatsapp.net", ...].
 * NOTE: participant list tumhein khud deni hai — aam tor par
 *   const meta = await sock.groupMetadata(groupJid);
 *   const participants = meta.participants.map(p => p.id);
 * se nikalte hain (wiring neeche demo mein).
 */
async function mentionAll(sock, groupJid, text, participants) {
    if (!Array.isArray(participants) || participants.length === 0) {
        throw new Error("wa-trick-group: participants (jid array) zaroori hai");
    }
    // Har participant ke liye @number text mein joro taake mention highlight ho
    const mentionText = participants
        .map((jid) => `@${jid.split("@")[0]}`)
        .join(" ");
    await sock.sendMessage(groupJid, {
        text: `${text}\n${mentionText}`,
        mentions: participants,
    });
}

/**
 * Welcome / goodbye handler.
 * Wiring: sock.ev.on("group-participants.update", welcomeHandler(sock));
 *
 * Baileys event payload: { id, participants, action }
 *   action = "add" | "remove" | "promote" | "demote"
 */
function welcomeHandler(sock) {
    return async (update) => {
        try {
            const { id, participants, action } = update;
            if (!id || !participants) return;

            if (action === "add") {
                const hello = participants.map((j) => `@${j.split("@")[0]}`).join(" ");
                await sock.sendMessage(id, {
                    text: `🎉 Welcome!\n${hello}\nGroup rules parho aur enjoy karo!`,
                    mentions: participants,
                });
            } else if (action === "remove") {
                const bye = participants.map((j) => `@${j.split("@")[0]}`).join(" ");
                await sock.sendMessage(id, {
                    text: `👋 Allah Hafiz!\n${bye}`,
                    mentions: participants,
                });
            }
            // promote/demote par kuch nahi — chaho to add kar lo
        } catch (e) {
            console.error("wa-trick-group welcomeHandler:", e.message);
        }
    };
}

/** Link detect karo (anti-link ke liye). */
function containsLink(text) {
    return /https?:\/\/|www\.|t\.me\//i.test(String(text || ""));
}

/*
 * ANTI-LINK HANDLER — snippet (apne main handler mein lagao)
 * ------------------------------------------------------------
 *   const { containsLink } = require("./wa-trick-group.cjs");
 *
 *   // messages.upsert ke andar, group messages ke liye:
 *   const isGroup = from.endsWith("@g.us");
 *   const senderIsAdmin = ...; // groupMetadata se check karo (neeche note)
 *   if (isGroup && !senderIsAdmin && containsLink(text)) {
 *       await sock.sendMessage(from, { delete: msg.key }); // message delete
 *       await sock.sendMessage(from, { text: `⚠️ @${sender.split("@")[0]} links allowed nahi!`, mentions: [sender] });
 *   }
 *
 * NOTE: admin check ke liye:
 *   const meta = await sock.groupMetadata(from);
 *   const me = meta.participants.find(p => p.id === sock.user.id);
 *   const senderIsAdmin = meta.participants.find(p => p.id === sender)?.admin;
 *   (bot khud admin ho tab hi delete kaam karega)
 */

/**
 * Group ka invite link bhejo.
 * sock.groupInviteCode(jid) Baileys ka standard API hai.
 * NOTE: bot ko group ka member hona chahiye.
 */
async function sendInviteLink(sock, groupJid, to, quotedMsg = null) {
    const code = await sock.groupInviteCode(groupJid);
    await sock.sendMessage(
        to,
        { text: `🔗 *Group Invite:*\nhttps://chat.whatsapp.com/${code}` },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
    return code;
}

module.exports = { mentionAll, welcomeHandler, containsLink, sendInviteLink };

/* ================= MOCK DEMO TEST ================= */
if (require.main === module) {
    (async () => {
        const sent = [];
        const sock = {
            sendMessage: async (jid, content, opts) => {
                sent.push({ jid, content, opts });
                return { ok: true };
            },
            groupInviteCode: async (jid) => {
                if (jid === "bad@g.us") throw new Error("not in group");
                return "AbCdEfGhIjK123456789";
            },
        };
        const groupJid = "120363000000@g.us";
        const parts = ["111@s.whatsapp.net", "222@s.whatsapp.net"];
        const assert = (cond, name) => console.log(cond ? `✅ ${name}` : `❌ FAIL: ${name}`);

        // mentionAll
        await mentionAll(sock, groupJid, "📢 *Announcement:* kal meeting hai!", parts);
        assert(
            sent[0].jid === groupJid &&
            sent[0].content.mentions.length === 2 &&
            sent[0].content.text.includes("@111"),
            "mentionAll payload"
        );
        try {
            await mentionAll(sock, groupJid, "x", []);
            assert(false, "khali participants par error aana chahiye tha");
        } catch (e) {
            assert(e.message.includes("participants"), "empty participants error");
        }

        // welcomeHandler — add
        const handler = welcomeHandler(sock);
        await handler({ id: groupJid, participants: ["333@s.whatsapp.net"], action: "add" });
        assert(sent[1].content.text.includes("Welcome") && sent[1].content.mentions[0] === "333@s.whatsapp.net", "welcome on add");

        // welcomeHandler — remove
        await handler({ id: groupJid, participants: ["444@s.whatsapp.net"], action: "remove" });
        assert(sent[2].content.text.includes("Hafiz"), "goodbye on remove");

        // welcomeHandler — promote (kuch nahi bhejna chahiye)
        const before = sent.length;
        await handler({ id: groupJid, participants: ["555@s.whatsapp.net"], action: "promote" });
        assert(sent.length === before, "promote par ignore");

        // containsLink
        assert(containsLink("join https://chat.whatsapp.com/abc") === true, "link detect https");
        assert(containsLink("t.me/xyz") === true, "link detect t.me");
        assert(containsLink("www.example.com") === true, "link detect www");
        assert(containsLink("salam, kya haal hai?") === false, "non-link false");
        assert(containsLink("") === false, "empty false");

        // sendInviteLink
        const code = await sendInviteLink(sock, groupJid, "999@s.whatsapp.net");
        assert(code === "AbCdEfGhIjK123456789", "invite code return");
        assert(sent[sent.length - 1].content.text.includes("https://chat.whatsapp.com/AbCdEfGhIjK123456789"), "invite link message");

        console.log(`\nTotal sends captured: ${sent.length}`);
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
