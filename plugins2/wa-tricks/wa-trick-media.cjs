/**
 * wa-trick-media.cjs — Media tricks for Baileys WhatsApp bots 📸
 * ================================================================
 * CommonJS only. Prefix used in examples: `-`
 *
 * Is file mein:
 *   - sendViewOnceText    (ek dafa dekhne wala text — FORK-DEPENDENT, neeche note)
 *   - sendViewOnceImage   (ek dafa dekhne wali image)
 *   - sendGif             (GIF as video + gifPlayback)
 *   - sendVoiceNote       (ptt voice note)
 *   - sendStickerFromImage(image -> webp sticker, ffmpeg se)
 *   - sendDocument        (file/document bhejo)
 *   - sendHDImage         ("HD" — client-dependent, neeche note)
 *
 * NOTE — verify cheezein:
 *   - View-once TEXT (`{ text, viewOnce: true }`) sirf newer/community
 *     Baileys forks mein kaam karta hai. Classic/stable Baileys mein
 *     view-once aam tor par image/video/audio tak mehdood hai.
 *     UNVERIFIED apni Baileys version par — pehle test karo.
 *   - Voice note ke liye audio OPUS-encoded hona chahiye (audio/mp4
 *     container mein). Ghalat codec par kuch clients ise voice note
 *     ki tarah render nahi karte.
 */

const fs = require("fs");
const path = require("path");

/**
 * Ek dafa dekhne wala TEXT.
 * UNVERIFIED: sirf newer forks mein; stable par kaam na kare to
 * view-once IMAGE ya documented limitation samjho.
 */
async function sendViewOnceText(sock, from, text, quotedMsg = null) {
    await sock.sendMessage(
        from,
        { text, viewOnce: true },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

/** Ek dafa dekhne wali IMAGE (standard Baileys). */
async function sendViewOnceImage(sock, from, imageUrl, caption = "", quotedMsg = null) {
    await sock.sendMessage(
        from,
        { image: { url: imageUrl }, caption, viewOnce: true },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

/** GIF bhejo (WhatsApp GIF ko video+gifPlayback ki tarah leta hai). */
async function sendGif(sock, from, gifUrl, caption = "", quotedMsg = null) {
    await sock.sendMessage(
        from,
        { video: { url: gifUrl }, gifPlayback: true, caption },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

/**
 * Voice note (ptt = push-to-talk).
 * audioUrl ideally OPUS audio ho (audio/mp4 container).
 */
async function sendVoiceNote(sock, from, audioUrl, quotedMsg = null) {
    await sock.sendMessage(
        from,
        { audio: { url: audioUrl }, mimetype: "audio/mp4", ptt: true },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

/** ffmpeg available hai ya nahi? */
function ffmpegAvailable() {
    try {
        require("child_process").execSync("ffmpeg -version", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

/**
 * Image -> WhatsApp STICKER.
 * WhatsApp sticker ke liye WEBP (512x512) chahiye, is liye ffmpeg
 * se convert karte hain. ffmpeg na ho to helpful error throw hota hai.
 */
async function sendStickerFromImage(sock, from, imagePath, quotedMsg = null) {
    if (!fs.existsSync(imagePath)) {
        throw new Error(`wa-trick-media: image file nahi mili: ${imagePath}`);
    }
    if (!ffmpegAvailable()) {
        throw new Error(
            "wa-trick-media: ffmpeg nahi mila. Sticker ke liye WEBP chahiye.\n" +
            "Install karo: sudo apt install ffmpeg\n" +
            "Ya pehle se .webp file ho to seedha bhejo: sock.sendMessage(from, { sticker: fs.readFileSync('a.webp') })"
        );
    }
    const out = path.join("/tmp", `sticker-${Date.now()}.webp`);
    require("child_process").execSync(
        `ffmpeg -y -v error -i "${imagePath}" -vcodec libwebp ` +
        `-vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512" "${out}"`
    );
    // NOTE: local file ko Buffer bana kar bhejte hain (Baileys Buffer support karta hai;
    // plain local path string par bharosa nahi — is liye readFileSync).
    const webp = fs.readFileSync(out);
    await sock.sendMessage(
        from,
        { sticker: webp },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
    try { fs.unlinkSync(out); } catch { /* ignore */ }
    return webp.length;
}

/** Document/file bhejo. */
async function sendDocument(sock, from, fileUrl, fileName, mimetype = "application/octet-stream", quotedMsg = null) {
    await sock.sendMessage(
        from,
        { document: { url: fileUrl }, fileName, mimetype },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

/**
 * "HD" image.
 * NOTE: Baileys mein koi documented standard `hd: true` flag nahi hai —
 * HD quality client-dependent hai. High-resolution image normal tareeqe
 * se bhejo; WhatsApp khud quality options dikhata hai.
 */
async function sendHDImage(sock, from, imageUrl, caption = "", quotedMsg = null) {
    await sock.sendMessage(
        from,
        { image: { url: imageUrl }, caption },
        quotedMsg ? { quoted: quotedMsg } : {}
    );
}

module.exports = {
    sendViewOnceText,
    sendViewOnceImage,
    sendGif,
    sendVoiceNote,
    sendStickerFromImage,
    sendDocument,
    sendHDImage,
    ffmpegAvailable,
};

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
        const from = "123@s.whatsapp.net";
        const assert = (cond, name) => console.log(cond ? `✅ ${name}` : `❌ FAIL: ${name}`);

        await sendViewOnceText(sock, from, "secret");
        assert(sent[0].content.text === "secret" && sent[0].content.viewOnce === true, "viewOnce text payload");

        await sendViewOnceImage(sock, from, "https://example.com/a.jpg", "cap");
        assert(sent[1].content.image && sent[1].content.viewOnce === true, "viewOnce image");

        await sendGif(sock, from, "https://example.com/a.gif", "gif!");
        assert(sent[2].content.video && sent[2].content.gifPlayback === true, "gif video+gifPlayback");

        await sendVoiceNote(sock, from, "https://example.com/a.mp4");
        assert(sent[3].content.audio && sent[3].content.ptt === true, "voice note ptt");

        await sendDocument(sock, from, "https://example.com/f.pdf", "f.pdf", "application/pdf");
        assert(sent[4].content.document && sent[4].content.fileName === "f.pdf", "document");

        await sendHDImage(sock, from, "https://example.com/big.jpg", "hd");
        assert(sent[5].content.image, "hd image");

        // Sticker test: 1x1 PNG banao, ffmpeg path check karo
        const png1x1 = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            "base64"
        );
        const testImg = "/tmp/wa-trick-test.png";
        fs.writeFileSync(testImg, png1x1);
        try {
            const bytes = await sendStickerFromImage(sock, from, testImg);
            assert(Buffer.isBuffer(sent[sent.length - 1].content.sticker), "sticker webp bheja (ffmpeg mila)");
            console.log(`   webp bytes: ${bytes}`);
        } catch (e) {
            assert(
                e.message.includes("ffmpeg nahi mila"),
                "sticker: ffmpeg missing par helpful error"
            );
            console.log("   (ffmpeg available:", ffmpegAvailable(), ")");
        }
        try { fs.unlinkSync(testImg); } catch { }

        // missing file path
        try {
            await sendStickerFromImage(sock, from, "/tmp/does-not-exist-xyz.png");
            assert(false, "missing file par error aana chahiye tha");
        } catch (e) {
            assert(e.message.includes("nahi mili"), "missing file par error");
        }

        console.log(`\nTotal sends captured: ${sent.length}`);
    })().catch((e) => { console.error("❌", e); process.exit(1); });
}
