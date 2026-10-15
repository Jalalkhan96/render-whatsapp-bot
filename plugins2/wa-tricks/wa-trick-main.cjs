/**
 * wa-trick-main.cjs — Wiring example: sab kuch jorne ka tareeqa 🔌
 * ===================================================================
 * CommonJS only. Prefix: `-` (opts.prefix se badal sakte ho)
 *
 * Ye POORA bot nahi — ek saaf EXAMPLE hai ke messages.upsert mein
 * handleMessage() ko kaise lagana hai aur button/list/flow/poll
 * responses ko kaise route karna hai.
 *
 *   const { createRouter } = require("./wa-trick-main.cjs");
 *   const router = createRouter(sock);
 *   sock.ev.on("messages.upsert", async ({ messages }) => {
 *       const msg = messages[0];
 *       if (!msg.message || msg.key.fromMe) return;
 *       await router.handleMessage(msg);
 *   });
 *   // group events ke liye (optional):
 *   // const { welcomeHandler } = require("./wa-trick-group.cjs");
 *   // sock.ev.on("group-participants.update", welcomeHandler(sock));
 *
 * TAP-REVEAL WIRING (agar ../tap-reveal.cjs istemal kar rahe ho):
 *   // const { handleTapReveal } = require("../tap-reveal.cjs");
 *   // handleMessage() ke BILKUL SHURU mein:
 *   // if (await handleTapReveal(sock, msg)) return;
 *
 * SIBLING FILES (isi folder mein):
 *   ./wa-trick-buttons.cjs  -> sendReplyButtons / handleButtonTap
 *   ./wa-trick-listmenu.cjs -> sendMainMenu / handleListSelect
 *   ./wa-trick-form.cjs      -> startForm / handleFormMessage
 *   Agar koi sibling na mile to built-in FALLBACK payload istemal hote
 *   hain — is liye ye file akele bhi chalti hai.
 */

function tryRequire(p) {
    try { return require(p); } catch { return null; }
}
const sibButtons = tryRequire("./wa-trick-buttons.cjs");
const sibLists = tryRequire("./wa-trick-listmenu.cjs");
const sibForm = tryRequire("./wa-trick-form.cjs");

/** Message se text nikalo (mukhtalif message types se). */
function extractText(msg) {
    const m = msg.message || {};
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        ""
    ).trim();
}

/* ---------- fallback payloads (sibling na ho to) ---------- */

function classicButtonsPayload() {
    return {
        text: "🔘 *Buttons demo*\nNeeche dabao:",
        footer: "wa-tricks",
        buttons: [
            { buttonId: "btn_yes", buttonText: { displayText: "✅ Yes" }, type: 1 },
            { buttonId: "btn_no", buttonText: { displayText: "❌ No" }, type: 1 },
        ],
        headerType: 1,
    };
}

function classicListPayload() {
    return {
        text: "📋 *Menu demo*\nList kholo aur chuno:",
        footer: "wa-tricks",
        title: "MAIN MENU",
        buttonText: "Dekho 👀",
        sections: [
            {
                title: "Tricks",
                rows: [
                    { title: "🎠 Slider", rowId: "menu_slider", description: "GIF slideshow" },
                    { title: "📇 vCard", rowId: "menu_vcard", description: "Contact card" },
                ],
            },
        ],
    };
}

/*
 * -form NOTE (ghor se parho):
 * ---------------------------
 * Asli interactive "Forms" = WhatsApp FLOWS. Is ke liye Meta Business
 * account + WhatsApp Manager mein Flow JSON configure karna parta hai —
 * saada Baileys bot se bina is setup ke NAHI bheje ja sakte.
 * (Is folder mein wa-trick-form.cjs ka sendFlowCTA dekho — flowId/token
 *  Meta se aata hai, yahan se generate nahi hota.)
 *
 * Kaam karne wala muthbadil: multi-step form — bot ek-ek karke sawal
 * poochta hai. Pehle sibling (wa-trick-form.cjs), warna built-in fallback.
 */
const BUILTIN_FORM_QS = ["📝 Aap ka *naam*?", "🎂 *Umar*?", "🏙️ *Shehar*?"];

/** Built-in fallback form flow (sibling na ho to). Testable rakha hai. */
async function handleBuiltInFormFlow(sock, sessions, msg, text, sender) {
    const sess = sessions.get(sender);
    if (!sess) return false;
    const reply = (content) => sock.sendMessage(msg.key.remoteJid, content, { quoted: msg });
    sess.answers.push(text);
    if (sess.step < BUILTIN_FORM_QS.length - 1) {
        sess.step++;
        await reply({ text: BUILTIN_FORM_QS[sess.step] });
    } else {
        const [naam, umar, shehar] = sess.answers;
        sessions.delete(sender);
        await reply({ text: `✅ *Form mukammal!*\n\n👤 Naam: ${naam}\n🎂 Umar: ${umar}\n🏙️ Shehar: ${shehar}` });
    }
    return true;
}

function createRouter(sock, opts = {}) {
    const prefix = opts.prefix || "-";
    const builtinSessions = new Map();

    const reply = (msg, content) =>
        sock.sendMessage(msg.key.remoteJid, content, { quoted: msg });

    /* ----- demo senders (sibling pehle, fallback baad mein) ----- */
    async function sendButtonsDemo(msg, from) {
        if (sibButtons?.sendReplyButtons) {
            await sibButtons.sendReplyButtons(sock, from, {
                text: "🔘 *Buttons demo*\nNeeche dabao:",
                footer: "wa-tricks",
                buttons: [
                    { id: "btn_yes", label: "✅ Yes" },
                    { id: "btn_no", label: "❌ No" },
                ],
            }, msg);
            return;
        }
        await sock.sendMessage(from, classicButtonsPayload(), { quoted: msg });
    }

    async function sendMenuDemo(msg, from) {
        if (sibLists?.sendMainMenu) {
            await sibLists.sendMainMenu(sock, from, msg);
            return;
        }
        await sock.sendMessage(from, classicListPayload(), { quoted: msg });
    }

    /* ----- response handlers ----- */
    async function onButtonTap(msg, buttonId) {
        if (sibButtons?.handleButtonTap) {
            const handled = await sibButtons.handleButtonTap(sock, msg, {
                btn_yes: async () => reply(msg, { text: "Tum ne *Yes* dabaya! ✅" }),
                btn_no: async () => reply(msg, { text: "Tum ne *No* dabaya! ❌" }),
            });
            if (handled) return;
        }
        if (buttonId === "btn_yes") await reply(msg, { text: "Tum ne *Yes* dabaya! ✅" });
        else if (buttonId === "btn_no") await reply(msg, { text: "Tum ne *No* dabaya! ❌" });
        else await reply(msg, { text: `Button dabaya: ${buttonId}` });
    }

    async function onListSelect(msg, rowId) {
        if (sibLists?.handleListSelect) {
            const handled = await sibLists.handleListSelect(sock, msg, {
                cmd_joke: async () => reply(msg, { text: "😂 Joke: WhatsApp bot ne kaha — 'main sirf text hoon!'" }),
                cmd_poll: async () => reply(msg, { text: "📊 Poll: wa-trick-polls.cjs dekho!" }),
                cmd_sticker: async () => reply(msg, { text: "🖼️ Sticker: wa-trick-media.cjs dekho!" }),
            });
            if (handled) return;
        }
        const map = {
            menu_slider: "🎠 Slider chuna! (slider-maker.cjs se GIF bhejo)",
            menu_vcard: "📇 vCard chuna! (wa-trick-contact-location.cjs dekho)",
        };
        await reply(msg, { text: map[rowId] || `Chuna: ${rowId}` });
    }

    async function onNativeFlow(msg, resp) {
        // NOTE: native-flow rendering Baileys version + client par munhasir
        // hai. Classic buttons/lists sab se reliable hain.
        await reply(msg, {
            text: `⚙️ Flow response mila.\n\`\`\`${JSON.stringify(resp).slice(0, 300)}\`\`\``,
        });
    }

    async function onPollUpdate(/* msg */) {
        console.log("wa-trick-main: poll update aaya");
    }

    /* ----- commands ----- */
    async function handleCommand(msg, text, sender, from) {
        const [cmd] = text.slice(prefix.length).trim().split(/\s+/);
        switch ((cmd || "").toLowerCase()) {
            case "menu":
                await sendMenuDemo(msg, from);
                break;
            case "buttons":
                await sendButtonsDemo(msg, from);
                break;
            case "form":
                if (sibForm?.startForm) {
                    await sibForm.startForm(sock, from, msg); // (sock, from, quotedMsg)
                } else {
                    builtinSessions.set(sender, { step: 0, answers: [] });
                    await reply(msg, {
                        text: "📝 *Form shuru!*\n\n" + BUILTIN_FORM_QS[0],
                    });
                }
                break;
            case "ping":
                await reply(msg, { text: "🏓 pong!" });
                break;
            case "help":
                await reply(msg, {
                    text:
                        "🤖 *wa-tricks*\n" +
                        `${prefix}menu — list menu demo\n` +
                        `${prefix}buttons — clickable buttons demo\n` +
                        `${prefix}form — multi-step form demo\n` +
                        `${prefix}ping — test`,
                });
                break;
            default:
                break; // unknown command -> khamosh
        }
    }

    async function handleMessage(msg) {
        const m = msg.message || {};
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;

        // TAP-REVEAL: // const { handleTapReveal } = require("../tap-reveal.cjs");
        //            // if (await handleTapReveal(sock, msg)) return;

        // 1. Button taps (classic + template + native-flow button ids)
        const tapId = sibButtons?.getButtonTapId
            ? sibButtons.getButtonTapId(msg)
            : m.buttonsResponseMessage?.selectedButtonId;
        if (tapId) { await onButtonTap(msg, tapId); return; }

        // 2. List selections
        const rowId = sibLists?.getListSelectId
            ? sibLists.getListSelectId(msg)
            : m.listResponseMessage?.singleSelectReply?.selectedRowId;
        if (rowId) { await onListSelect(msg, rowId); return; }

        // 3. Native flow (non-button-id responses)
        if (m.interactiveResponseMessage) { await onNativeFlow(msg, m.interactiveResponseMessage); return; }

        // 4. Poll updates
        if (m.pollUpdateMessage) { await onPollUpdate(msg); return; }

        // 5. Text
        const text = extractText(msg);
        if (!text) return;

        // 5a. Sibling form session?
        if (sibForm?.handleFormMessage && await sibForm.handleFormMessage(sock, msg)) return;

        // 5b. Built-in fallback form session?
        if (await handleBuiltInFormFlow(sock, builtinSessions, msg, text, sender)) return;

        // 5c. Commands
        if (text.startsWith(prefix)) await handleCommand(msg, text, sender, from);
    }

    return { handleMessage, extractText, prefix };
}

module.exports = { createRouter, extractText, handleBuiltInFormFlow, BUILTIN_FORM_QS };

/* ================= MOCK DEMO TEST ================= */
if (require.main === module) {
    (async () => {
        const sent = [];
        const sock = {
            sendMessage: async (jid, content, opts) => {
                sent.push({ jid, content, quoted: !!opts?.quoted });
                return { ok: true };
            },
        };
        const assert = (cond, name) => console.log(cond ? `✅ ${name}` : `❌ FAIL: ${name}`);
        const sibForm = tryRequire("./wa-trick-form.cjs");
        if (sibForm?.setSubmissionsFile) sibForm.setSubmissionsFile("/tmp/wa-trick-form-test.jsonl");

        const router = createRouter(sock);
        const user = "123@s.whatsapp.net";
        const txtMsg = (t) => ({ key: { remoteJid: user }, message: { conversation: t } });
        console.log(`(siblings: buttons=${!!sibButtons}, lists=${!!sibLists}, form=${!!sibForm})`);

        // 1. -menu -> list payload (sibling: Tools+Fun sections)
        await router.handleMessage(txtMsg("-menu"));
        const menu = sent[0].content;
        assert(Array.isArray(menu.sections) && menu.sections.length >= 1, "-menu list payload");

        // 2. list select -> routed (sibling row id)
        await router.handleMessage({
            key: { remoteJid: user },
            message: { listResponseMessage: { singleSelectReply: { selectedRowId: "cmd_joke" } } },
        });
        assert(sent[1].content.text.includes("Joke"), "list select routed");

        // 3. -buttons -> buttons payload
        await router.handleMessage(txtMsg("-buttons"));
        assert(
            Array.isArray(sent[2].content.buttons) && sent[2].content.buttons[0].buttonId === "btn_yes",
            "-buttons payload"
        );

        // 4. button tap -> routed
        await router.handleMessage({
            key: { remoteJid: user },
            message: { buttonsResponseMessage: { selectedButtonId: "btn_yes" } },
        });
        assert(sent[3].content.text.includes("Yes"), "button tap routed");

        // 5. -form -> sibling flow: naam -> phone -> city -> summary
        await router.handleMessage(txtMsg("-form"));
        assert(sent[4].content.text.includes("Form shuru"), "-form start");
        await router.handleMessage(txtMsg("Ali"));
        assert(sent[5].content.text.includes("Step 2/3"), "-form step 2 (phone)");
        await router.handleMessage(txtMsg("not-a-phone"));
        assert(sent[6].content.text.includes("Sahi phone number"), "-form invalid phone dobara");
        await router.handleMessage(txtMsg("+923001234567"));
        assert(sent[7].content.text.includes("Step 3/3"), "-form step 3 (city)");
        await router.handleMessage(txtMsg("Lahore"));
        assert(sent[8].content.text.includes("mukammal") && sent[8].content.text.includes("Lahore"), "-form summary");

        // 6. built-in fallback form flow (seedha test)
        const sessions = new Map();
        const mkMsg = (t) => ({ key: { remoteJid: user }, message: { conversation: t } });
        sessions.set(user, { step: 0, answers: [] });
        const n0 = sent.length;
        await handleBuiltInFormFlow(sock, sessions, mkMsg("Ahmed"), "Ahmed", user);
        assert(sent[n0].content.text.includes("Umar"), "builtin form Q2");
        await handleBuiltInFormFlow(sock, sessions, mkMsg("30"), "30", user);
        assert(sent[n0 + 1].content.text.includes("Shehar"), "builtin form Q3");
        await handleBuiltInFormFlow(sock, sessions, mkMsg("Karachi"), "Karachi", user);
        assert(sent[n0 + 2].content.text.includes("Karachi"), "builtin form summary");

        // 7. unknown command -> khamosh
        const n = sent.length;
        await router.handleMessage(txtMsg("-xyz"));
        assert(sent.length === n, "unknown command ignore");

        // 8. poll update -> no crash
        await router.handleMessage({ key: { remoteJid: user }, message: { pollUpdateMessage: {} } });
        assert(true, "poll update handled");

        try { require("fs").unlinkSync("/tmp/wa-trick-form-test.jsonl"); } catch { }
        console.log(`\nTotal sends captured: ${sent.length}`);
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
