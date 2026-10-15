/**
 * wa-trick-html.cjs — HTML file as WhatsApp attachment 📄
 * =========================================================
 * WhatsApp chat mein HTML RENDER nahi hota, lekin .html file
 * document ki tarah bheji ja sakti hai — user download karke
 * browser mein kholta hai.
 *
 *   const { sendHtmlFile } = require("./wa-trick-html.cjs");
 *
 *   // -html command:
 *   await sendHtmlFile(sock, from, "./menu.html", {}, msg);
 */

const fs = require("fs");
const path = require("path");

/**
 * HTML file bhejo.
 * filePath: local path ("./menu.html") ya URL ("https://.../page.html")
 * opts: { fileName, caption }
 */
async function sendHtmlFile(sock, from, filePath, opts = {}, quotedMsg = null) {
    const isUrl = /^https?:\/\//i.test(filePath);
    if (!isUrl && !fs.existsSync(filePath)) {
        throw new Error("❌ File nahi mili: " + filePath);
    }
    const {
        fileName = isUrl ? "page.html" : path.basename(filePath),
        caption = "",
    } = opts;

    await sock.sendMessage(
        from,
        {
            document: { url: filePath },
            mimetype: "text/html",   // 👈 zaroori — warna WhatsApp pehchanega nahi
            fileName,                // .html extension rakho
            caption,                 // optional: "👆 File kholo, browser mein dekho"
        },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

/** Buffer se HTML bhejo (file save kiye baghair) */
async function sendHtmlBuffer(sock, from, htmlString, fileName = "page.html", quotedMsg = null) {
    await sock.sendMessage(
        from,
        {
            document: Buffer.from(htmlString, "utf8"),
            mimetype: "text/html",
            fileName,
        },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

module.exports = { sendHtmlFile, sendHtmlBuffer };

/* demo test */
if (require.main === module) {
    (async () => {
        const sent = [];
        const sock = {
            sendMessage: async (jid, content, opts) => { sent.push({ jid, content, opts }); },
        };
        const from = "123@s.whatsapp.net";
        const fakeMsg = { key: { remoteJid: from } };

        // 1. file se
        await sendHtmlFile(sock, from, "/home/hatch/workspace/your_files/demo-menu.html",
            { caption: "👆 Download karke kholo!" }, fakeMsg);
        const c1 = sent[0].content;
        console.log("✅ document:", !!c1.document, "| mimetype:", c1.mimetype,
            "| fileName:", c1.fileName, "| quoted:", !!sent[0].opts.quoted);

        // 2. buffer se
        await sendHtmlBuffer(sock, from, "<h1>Salam!</h1>", "salam.html");
        const c2 = sent[1].content;
        console.log("✅ buffer:", Buffer.isBuffer(c2.document),
            "| mimetype:", c2.mimetype, "| fileName:", c2.fileName);

        // 3. missing file error
        try { await sendHtmlFile(sock, from, "./nahi-hai.html"); console.log("❌ error nahi aaya"); }
        catch (e) { console.log("✅ missing file error:", e.message); }
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
