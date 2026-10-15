/**
 * wa-trick-listmenu.cjs — Slider Menu (List Message) for Baileys bots 📋
 * =======================================================================
 * "Slider menu" = WhatsApp ka List Message: ek button dabao to
 * neeche se sections wali list slide-up hoti hai.
 *
 * Payload: { text, footer, title, buttonText,
 *             sections: [{ title, rows: [{ title, description, rowId }] }] }
 *
 * NOTE: List messages kuch naye WhatsApp clients/versions par render
 * NAHI hote (WhatsApp ne inhe deprecate karne ki taraf qadam uthaye hain).
 * Ye structure Baileys ke documented examples par mabni hai —
 * tumhare client/Baileys version mein live-verified NAHI (unverified).
 * Pehle `-menu` bhej kar apne phone par test karo.
 *
 *   const {
 *       sendListMenu, getListSelectId, handleListSelect, sendMainMenu,
 *   } = require("./wa-trick-listmenu.cjs");
 *
 *   // -menu command:
 *   await sendMainMenu(sock, from, msg);
 *
 *   // Handler mein (sab se upar):
 *   if (await handleListSelect(sock, msg, {
 *       cmd_sticker: async (s, m) => s.sendMessage(m.key.remoteJid, { text: "Sticker ban raha hai… 🎨" }, { quoted: m }),
 *       cmd_joke:    async (s, m) => s.sendMessage(m.key.remoteJid, { text: "😂…" }, { quoted: m }),
 *   })) return;
 */

/**
 * List menu bhejo.
 * sections: [{ title, rows: [{ id, title, description }] }]
 * Bhejte waqt row ka id `rowId` field mein jata hai.
 */
async function sendListMenu(sock, from, opts = {}, quotedMsg = null) {
    const {
        text = "",
        footer = "",
        title = "",
        buttonText = "📋 MENU",
        sections = [],
    } = opts;

    if (!Array.isArray(sections) || sections.length === 0) {
        throw new Error("sendListMenu: kam az kam 1 section do — [{title, rows}]");
    }
    for (const s of sections) {
        if (!Array.isArray(s.rows) || s.rows.length === 0) {
            throw new Error(`sendListMenu: section "${s.title}" mein kam az kam 1 row do`);
        }
        for (const r of s.rows) {
            if (!r.id || !r.title) {
                throw new Error("sendListMenu: har row mein {id, title} zaroori hai");
            }
        }
    }

    const payload = {
        text,
        footer,
        title,
        buttonText,
        sections: sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
                title: r.title,
                description: r.description || "",
                rowId: r.id,
            })),
        })),
    };

    await sock.sendMessage(from, payload, quotedMsg ? { quoted: quotedMsg } : {});
    return sections.reduce((n, s) => n + s.rows.length, 0); // kul rows
}

/**
 * User ne kaunsi row chuni? Us ka rowId nikalo.
 * Path: msg.message.listResponseMessage.singleSelectReply.selectedRowId
 *
 * NOTE: kuch Baileys forks/community docs mein `rowId` ki jagah `id`
 * likha milta hai — bhejte waqt `rowId` istemal karo (Baileys README
 * ke mutabiq); select par `selectedRowId` parho.
 */
function getListSelectId(msg) {
    const m = msg && msg.message;
    if (!m) return null;
    const sel = m.listResponseMessage && m.listResponseMessage.singleSelectReply;
    return (sel && sel.selectedRowId) || null;
}

/**
 * handlers = { rowId: async (sock, msg, id) => {...} }
 * Match hua to handler chalao aur true do, warna false.
 */
async function handleListSelect(sock, msg, handlers = {}) {
    const id = getListSelectId(msg);
    if (!id) return false;
    const fn = handlers[id];
    if (typeof fn !== "function") return false;
    await fn(sock, msg, id);
    return true;
}

/**
 * Demo main menu: 2 sections (Tools, Fun) × 3 rows.
 */
async function sendMainMenu(sock, from, quotedMsg = null) {
    return sendListMenu(sock, from, {
        title: "🤖 Bot Menu",
        text: "Neeche button dabao aur koi option chuno 👇",
        footer: "Baileys Bot • v1",
        buttonText: "📋 MENU KHOLO",
        sections: [
            {
                title: "🛠️ Tools",
                rows: [
                    { id: "cmd_sticker", title: "Sticker banao", description: "Photo se sticker" },
                    { id: "cmd_qr", title: "QR code", description: "Text ka QR banao" },
                    { id: "cmd_weather", title: "Mausam", description: "Sheher ka mausam dekho" },
                ],
            },
            {
                title: "🎉 Fun",
                rows: [
                    { id: "cmd_joke", title: "Joke", description: "Ek naya joke suno" },
                    { id: "cmd_ttt", title: "Tic-Tac-Toe", description: "Bot ke saath khelo" },
                    { id: "cmd_poll", title: "Poll", description: "Group poll banao" },
                ],
            },
        ],
    }, quotedMsg);
}

module.exports = {
    sendListMenu,
    getListSelectId,
    handleListSelect,
    sendMainMenu,
};

/* ============ MOCK DEMO TEST ============ */
if (require.main === module) {
    (async () => {
        const sent = [];
        const sock = {
            sendMessage: async (jid, content, opts) => {
                sent.push({ jid, content, opts });
            },
        };
        const from = "123@s.whatsapp.net";
        let pass = 0, fail = 0;
        const ok = (name, cond) => {
            console.log(cond ? "✅" : "❌", name);
            cond ? pass++ : fail++;
        };

        // 1. Main menu
        const totalRows = await sendMainMenu(sock, from);
        const p0 = sent[0].content;
        ok("menu: kul 6 rows wapis", totalRows === 6);
        ok("menu: title", p0.title === "🤖 Bot Menu");
        ok("menu: buttonText", p0.buttonText === "📋 MENU KHOLO");
        ok("menu: 2 sections", p0.sections.length === 2);
        ok("menu: section titles", p0.sections[0].title === "🛠️ Tools" && p0.sections[1].title === "🎉 Fun");
        ok("menu: har section mein 3 rows", p0.sections[0].rows.length === 3 && p0.sections[1].rows.length === 3);

        const firstRow = p0.sections[0].rows[0];
        ok("menu: row shape {title, description, rowId}",
            firstRow.title === "Sticker banao"
            && firstRow.description === "Photo se sticker"
            && firstRow.rowId === "cmd_sticker");

        // 2. Validation
        let threw = false;
        try { await sendListMenu(sock, from, { text: "x", sections: [] }); }
        catch (e) { threw = /section/i.test(e.message); }
        ok("validation: khali sections par error", threw);

        // 3. getListSelectId
        const selMsg = {
            message: { listResponseMessage: { singleSelectReply: { selectedRowId: "cmd_joke" } } },
        };
        ok("select: rowId nikla", getListSelectId(selMsg) === "cmd_joke");
        ok("select: koi select nahi -> null", getListSelectId({ message: { conversation: "hi" } }) === null);

        // 4. handleListSelect
        let called = null;
        const r1 = await handleListSelect(sock, { key: { remoteJid: from }, ...selMsg }, {
            cmd_joke: async (s, m, id) => { called = id; },
        });
        ok("handle: match -> true + handler chala", r1 === true && called === "cmd_joke");
        const r2 = await handleListSelect(sock, { key: { remoteJid: from }, ...selMsg }, {
            cmd_sticker: async () => {},
        });
        ok("handle: no match -> false", r2 === false);

        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
