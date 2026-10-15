/**
 * wa-trick-buttons.cjs — Clickable Buttons for Baileys bots 🔘
 * ==============================================================
 * Do qisam ke buttons:
 *   1. CLASSIC reply buttons  (sab se reliable, max 3)
 *   2. CTA native-flow buttons (URL / Call / Copy / Quick-reply)
 *
 * Baileys version ke hisaab se rendering farq ho sakta hai —
 * apne client par `-menu` se test karo. Ye payloads Baileys ke
 * documented examples par mabni hain; tumhare setup mein
 * live-verified NAHI (unverified).
 *
 *   const {
 *       sendReplyButtons, sendCTAButtons,
 *       getButtonTapId, handleButtonTap,
 *   } = require("./wa-trick-buttons.cjs");
 *
 *   // -menu command:
 *   await sendReplyButtons(sock, from, {
 *       text: "Koi option chuno 👇",
 *       footer: "Bot Menu",
 *       buttons: [
 *           { id: "menu_sticker", label: "🎨 Sticker" },
 *           { id: "menu_joke",   label: "😂 Joke" },
 *           { id: "menu_time",    label: "🕒 Time" },
 *       ],
 *   }, msg);
 *
 *   // Handler mein (sab se upar):
 *   if (await handleButtonTap(sock, msg, {
 *       menu_sticker: async (s, m) => s.sendMessage(m.key.remoteJid, { text: "Sticker!" }, { quoted: m }),
 *       menu_joke:    async (s, m) => s.sendMessage(m.key.remoteJid, { text: "Joke!" }, { quoted: m }),
 *   })) return;
 */

/**
 * CLASSIC quick-reply buttons.
 * Payload: { text, footer, buttons: [{ buttonId, buttonText: { displayText }, type: 1 }], headerType: 1 }
 * WhatsApp limit: MAX 3 buttons.
 */
async function sendReplyButtons(sock, from, opts = {}, quotedMsg = null) {
    const { text = "", footer = "", buttons = [] } = opts;

    if (!Array.isArray(buttons) || buttons.length === 0) {
        throw new Error("sendReplyButtons: kam az kam 1 button do — [{id, label}]");
    }
    if (buttons.length > 3) {
        throw new Error("sendReplyButtons: max 3 buttons (WhatsApp limit)");
    }
    for (const b of buttons) {
        if (!b.id || !b.label) {
            throw new Error("sendReplyButtons: har button mein {id, label} zaroori hai");
        }
    }

    const payload = {
        text,
        footer,
        buttons: buttons.map((b) => ({
            buttonId: b.id,
            buttonText: { displayText: b.label },
            type: 1,
        })),
        headerType: 1,
    };

    await sock.sendMessage(from, payload, quotedMsg ? { quoted: quotedMsg } : {});
    return buttons.map((b) => b.id);
}

/**
 * CTA / NATIVE-FLOW buttons: URL kholo, Call karo, Copy karo, Quick-reply.
 *
 * NOTE: Native flow kuch clients/Baileys versions par render NAHI hota.
 * Classic reply buttons zyada reliable hain. Ye structure community
 * examples par mabni hai — tumhare Baileys version mein live-verified NAHI.
 *
 * buttons: [{ type: 'url'|'call'|'copy'|'quick', label, value, id? }]
 *   url   -> value = "https://..."
 *   call  -> value = "+923001234567"
 *   copy  -> value = "copy hone wala code"
 *   quick -> id = wapis aane wala button id
 */
async function sendCTAButtons(sock, from, opts = {}, quotedMsg = null) {
    const { text = "", footer = "", headerTitle = "", buttons = [] } = opts;

    if (!Array.isArray(buttons) || buttons.length === 0) {
        throw new Error("sendCTAButtons: kam az kam 1 button do");
    }

    const flowButtons = buttons.map((b) => {
        let name, params;
        switch (b.type) {
            case "url":
                name = "cta_url";
                params = { display_text: b.label, url: b.value };
                break;
            case "call":
                name = "cta_call";
                params = { display_text: b.label, phone_number: b.value };
                break;
            case "copy":
                name = "cta_copy";
                params = { display_text: b.label, copy_code: b.value };
                break;
            case "quick":
            default:
                name = "quick_reply";
                params = { display_text: b.label, id: b.id || b.label };
                break;
        }
        return { name, buttonParamsJson: JSON.stringify(params) };
    });

    const payload = {
        interactiveMessage: {
            body: { text },
            footer: { text: footer },
            header: { title: headerTitle, hasMediaAttachment: false },
            nativeFlowMessage: { buttons: flowButtons },
        },
    };

    await sock.sendMessage(from, payload, quotedMsg ? { quoted: quotedMsg } : {});
    return flowButtons.map((b) => b.name);
}

/**
 * Tap ka button id nikalo — teeno formats check karta hai:
 *  1. buttonsResponseMessage.selectedButtonId      (classic)
 *  2. templateButtonReplyMessage.selectedId        (template/hydrated)
 *  3. interactiveResponseMessage.nativeFlowResponseMessage.paramsJson -> {id}
 *     (native flow; paramsJson ek JSON string hai — parse fail ho to null)
 * Returns: id string ya null.
 */
function getButtonTapId(msg) {
    const m = msg && msg.message;
    if (!m) return null;

    const classic = m.buttonsResponseMessage && m.buttonsResponseMessage.selectedButtonId;
    if (classic) return classic;

    const tpl = m.templateButtonReplyMessage && m.templateButtonReplyMessage.selectedId;
    if (tpl) return tpl;

    const ir = m.interactiveResponseMessage
        && m.interactiveResponseMessage.nativeFlowResponseMessage
        && m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson;
    if (ir) {
        try {
            const p = JSON.parse(ir);
            if (p && p.id) return p.id;
        } catch (e) { /* malformed paramsJson — ignore */ }
    }

    return null;
}

/**
 * handlers = { buttonId: async (sock, msg, id) => {...} }
 * Match hua to handler chalao aur true do, warna false.
 */
async function handleButtonTap(sock, msg, handlers = {}) {
    const id = getButtonTapId(msg);
    if (!id) return false;
    const fn = handlers[id];
    if (typeof fn !== "function") return false;
    await fn(sock, msg, id);
    return true;
}

module.exports = {
    sendReplyButtons,
    sendCTAButtons,
    getButtonTapId,
    handleButtonTap,
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

        // 1. Classic buttons
        const ids = await sendReplyButtons(sock, from, {
            text: "Koi option chuno 👇",
            footer: "Bot Menu",
            buttons: [
                { id: "menu_sticker", label: "🎨 Sticker" },
                { id: "menu_joke", label: "😂 Joke" },
                { id: "menu_time", label: "🕒 Time" },
            ],
        });
        const p0 = sent[0].content;
        ok("classic: 3 buttonIds wapis", JSON.stringify(ids) === JSON.stringify(["menu_sticker", "menu_joke", "menu_time"]));
        ok("classic: payload.buttons[0].buttonId", p0.buttons[0].buttonId === "menu_sticker");
        ok("classic: payload.buttons[0].buttonText.displayText", p0.buttons[0].buttonText.displayText === "🎨 Sticker");
        ok("classic: type=1, headerType=1", p0.buttons[0].type === 1 && p0.headerType === 1);
        ok("classic: footer gaya", p0.footer === "Bot Menu");

        // 2. Max 3 enforcement
        let threw = false;
        try {
            await sendReplyButtons(sock, from, {
                text: "x",
                buttons: [
                    { id: "a", label: "a" }, { id: "b", label: "b" },
                    { id: "c", label: "c" }, { id: "d", label: "d" },
                ],
            });
        } catch (e) { threw = /max 3/i.test(e.message); }
        ok("classic: 4th button par error", threw);

        // 3. CTA native flow
        await sendCTAButtons(sock, from, {
            text: "Links 👇",
            footer: "CTA demo",
            headerTitle: "Mere Links",
            buttons: [
                { type: "url", label: "🌐 Website", value: "https://example.com" },
                { type: "call", label: "📞 Call", value: "+923001234567" },
                { type: "copy", label: "📋 Copy code", value: "PROMO50" },
                { type: "quick", label: "⚡ Quick", id: "quick_hi" },
            ],
        });
        const p1 = sent[1].content;
        const fb = p1.interactiveMessage.nativeFlowMessage.buttons;
        ok("cta: 4 flow buttons", fb.length === 4);
        ok("cta: names", JSON.stringify(fb.map((b) => b.name)) === JSON.stringify(["cta_url", "cta_call", "cta_copy", "quick_reply"]));
        ok("cta: url params", JSON.parse(fb[0].buttonParamsJson).url === "https://example.com");
        ok("cta: call params", JSON.parse(fb[1].buttonParamsJson).phone_number === "+923001234567");
        ok("cta: copy params", JSON.parse(fb[2].buttonParamsJson).copy_code === "PROMO50");
        ok("cta: quick id", JSON.parse(fb[3].buttonParamsJson).id === "quick_hi");
        ok("cta: header title", p1.interactiveMessage.header.title === "Mere Links");

        // 4. getButtonTapId — teeno formats
        ok("tap: classic", getButtonTapId({ message: { buttonsResponseMessage: { selectedButtonId: "menu_joke" } } }) === "menu_joke");
        ok("tap: template", getButtonTapId({ message: { templateButtonReplyMessage: { selectedId: "tpl_x" } } }) === "tpl_x");
        ok("tap: native flow", getButtonTapId({ message: { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: "quick_hi" }) } } } }) === "quick_hi");
        ok("tap: koi tap nahi -> null", getButtonTapId({ message: { conversation: "hello" } }) === null);

        // 5. handleButtonTap
        let called = null;
        const tapMsg = { key: { remoteJid: from }, message: { buttonsResponseMessage: { selectedButtonId: "menu_joke" } } };
        const r1 = await handleButtonTap(sock, tapMsg, {
            menu_joke: async (s, m, id) => { called = id; },
        });
        ok("handle: match -> true + handler chala", r1 === true && called === "menu_joke");
        const r2 = await handleButtonTap(sock, tapMsg, { kuch_aur: async () => {} });
        ok("handle: no match -> false", r2 === false);

        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
