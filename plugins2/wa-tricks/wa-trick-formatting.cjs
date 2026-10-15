/**
 * wa-trick-formatting.cjs — WhatsApp ke TAMAM text styles 🎨
 * ============================================================
 * WhatsApp formatting client-side render hoti hai: bot sirf
 * sahi markdown bheje, har phone khud style laga lega.
 * (Purane clients par marks aise hi nazar aa sakte hain.)
 *
 * 8 SUPPORTED STYLES (+ 1 beta):
 *   1. Bold          *text*
 *   2. Italic        _text_
 *   3. Strikethrough ~text~
 *   4. Mono block    ```text```
 *   5. Inline code   `text`
 *   6. Quote block   > text   (har line ke shuru mein >)
 *   7. Bulleted list - item
 *   8. Numbered list 1. item
 *   9. Spoiler       ||text||  — BETA ONLY (neeche note parho)
 *
 *   const F = require("./wa-trick-formatting.cjs");
 *   await sock.sendMessage(from, { text: F.formatDemoMessage() });
 */

const bold = (t) => `*${t}*`;
const italic = (t) => `_${t}_`;
const strike = (t) => `~${t}~`;
const monoBlock = (t) => "```" + t + "```";
const inlineCode = (t) => "`" + t + "`";

function quoteBlock(text) {
    return String(text).split("\n").map((l) => `> ${l}`).join("\n");
}

function bulletList(items) {
    return items.map((i) => `- ${i}`).join("\n");
}

function numberedList(items) {
    return items.map((i, n) => `${n + 1}. ${i}`).join("\n");
}

/**
 * Spoiler: ||text||
 *
 * NOTE (Oct 2026): native spoiler ABHI TAK stable WhatsApp par
 * launch NAHI hua — sirf beta builds mein test ho raha hai.
 * Aaj `||text||` bhejoge to stable clients par pipes aise hi
 * (literal) nazar aayenge; beta clients par tap-to-reveal blur
 * banega. Syntax pehle se tayyar rakho — launch par khud kaam karega.
 */
function spoiler(text) {
    return `||${text}||`;
}

/**
 * Ek hi message mein 8 styles + spoiler — labels ke saath.
 * WhatsApp mein bhejo to sab render ho jayenge (spoiler sirf beta par).
 */
function formatDemoMessage() {
    return [
        "🎨 *WhatsApp Text Styles Demo*",
        "",
        "1️⃣ " + bold("Bold") + " — *text*",
        "2️⃣ " + italic("Italic") + " — _text_",
        "3️⃣ " + strike("Strikethrough") + " — ~text~",
        "4️⃣ " + monoBlock("Mono block") + " — triple backtick",
        "5️⃣ " + inlineCode("inline code") + " — single backtick",
        "6️⃣ Quote block:",
        quoteBlock("har line ke shuru mein >"),
        "7️⃣ Bulleted list:",
        bulletList(["pehla", "dosra"]),
        "8️⃣ Numbered list:",
        numberedList(["pehla", "dosra"]),
        "9️⃣ " + spoiler("Spoiler (sirf beta par blur)") + " — ||text||",
    ].join("\n");
}

async function sendFormatDemo(sock, from, quotedMsg = null) {
    const text = formatDemoMessage();
    await sock.sendMessage(from, { text }, quotedMsg ? { quoted: quotedMsg } : {});
    return text;
}

module.exports = {
    bold,
    italic,
    strike,
    monoBlock,
    inlineCode,
    quoteBlock,
    bulletList,
    numberedList,
    spoiler,
    formatDemoMessage,
    sendFormatDemo,
};

/* ============ MOCK DEMO TEST ============ */
if (require.main === module) {
    (async () => {
        let pass = 0, fail = 0;
        const ok = (name, cond) => {
            console.log(cond ? "✅" : "❌", name);
            cond ? pass++ : fail++;
        };

        ok("bold", bold("hi") === "*hi*");
        ok("italic", italic("hi") === "_hi_");
        ok("strike", strike("hi") === "~hi~");
        ok("monoBlock", monoBlock("hi") === "```hi```");
        ok("inlineCode", inlineCode("hi") === "`hi`");
        ok("quoteBlock single", quoteBlock("hi") === "> hi");
        ok("quoteBlock multi", quoteBlock("a\nb") === "> a\n> b");
        ok("bulletList", bulletList(["a", "b"]) === "- a\n- b");
        ok("numberedList", numberedList(["a", "b"]) === "1. a\n2. b");
        ok("spoiler wrap", spoiler("x") === "||x||");

        const demo = formatDemoMessage();
        ok("demo: 8 styles + spoiler labels",
            demo.includes("*Bold*") && demo.includes("_Italic_")
            && demo.includes("~Strikethrough~") && demo.includes("```Mono block```")
            && demo.includes("`inline code`") && demo.includes("> har line")
            && demo.includes("- pehla") && demo.includes("1. pehla")
            && demo.includes("||Spoiler"));

        const sent = [];
        const sock = { sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); } };
        const returned = await sendFormatDemo(sock, "123@s.whatsapp.net");
        ok("sendFormatDemo: text gaya", sent[0].content.text === returned && returned.length > 50);

        console.log("\n------ DEMO MESSAGE (WhatsApp mein bhejo) ------\n");
        console.log(demo);
        console.log("\n-----------------------------------------------");
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
