/**
 * slider-maker.cjs — Image Slider FULL CODE 🎠
 * ==============================================
 * 1. Apni images  ./slides/  folder mein rakho (jpg/png/webp)
 * 2. Chalao:  node slider-maker.cjs
 *    -> slider.gif  (GIF slider)
 *    -> slider.mp4  (video slider)
 * 3. Bot se bhejo (neeche sendGifSlider / sendVideoSlider)
 *
 * Zaroorat: ffmpeg installed ho (https://ffmpeg.org)
 *           npm install nahi chahiye!
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---------- SETTINGS (apne hisab se badlo) ----------
const SLIDES_DIR = "./slides";   // images ka folder
const OUT_GIF = "./slider.gif";
const OUT_MP4 = "./slider.mp4";
const SECONDS_PER_SLIDE = 1.5;   // har image kitne second ruke
const WIDTH = 640;               // slider ki chaudai (px)
// ------------------------------------------------------

function getSlides(dir) {
    if (!fs.existsSync(dir))
        throw new Error(`Folder nahi mila: ${dir} — images rakho!`);
    const files = fs.readdirSync(dir)
        .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
        .sort()
        .map((f) => path.join(dir, f));
    if (files.length === 0)
        throw new Error(`${dir} khaali hai — images rakho!`);
    return files;
}

function run(cmd) {
    execSync(cmd, { stdio: "pipe" });
}

/**
 * GIF slider banao — har image SECONDS_PER_SLIDE tak, loop mein.
 */
function makeGif(files, outPath = OUT_GIF,
                 seconds = SECONDS_PER_SLIDE, width = WIDTH) {
    const fps = (1 / seconds).toFixed(3);
    const inputs = files.map((f) => `-framerate ${fps} -i "${f}"`).join(" ");
    const n = files.length;
    // har image ko utne frames do jitne seconds ke liye chahiye
    const filter = files.map((_, i) =>
        `[${i}:v]scale=${width}:${width}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${width},split[s${i}0][s${i}1];` +
        `[s${i}0]palettegen=max_colors=256[p${i}];` +
        `[s${i}1][p${i}]paletteuse[v${i}]`
    ).join(";") + ";" + files.map((_, i) => `[v${i}]`).join("") +
        `concat=n=${n}:v=1:a=0[out]`;
    run(`ffmpeg -y -v error ${inputs} -filter_complex "${filter}" ` +
        `-map "[out]" -loop 0 "${outPath}"`);
    console.log("✅ GIF:", outPath);
    return outPath;
}

/**
 * Video slider banao (MP4) — WhatsApp par video ki tarah chalega.
 */
function makeMp4(files, outPath = OUT_MP4,
                 seconds = SECONDS_PER_SLIDE, width = WIDTH) {
    const fps = (1 / seconds).toFixed(3);
    const inputs = files.map((f) => `-framerate ${fps} -i "${f}"`).join(" ");
    const n = files.length;
    const filter = files.map((_, i) =>
        `[${i}:v]scale=${width}:${width}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${width}[v${i}]`
    ).join(";") + ";" + files.map((_, i) => `[v${i}]`).join("") +
        `concat=n=${n}:v=1:a=0,format=yuv420p[out]`;
    run(`ffmpeg -y -v error ${inputs} -filter_complex "${filter}" ` +
        `-map "[out]" -c:v libx264 -preset fast -movflags +faststart "${outPath}"`);
    console.log("✅ MP4:", outPath);
    return outPath;
}

/* ================= BAILEYS SENDER ================= */

/** GIF slider bhejo — WhatsApp mein khud animate hoga */
async function sendGifSlider(sock, from, gifPath = OUT_GIF,
                             caption = "🎠 *New Collection* 👟",
                             quotedMsg = null) {
    await sock.sendMessage(from, {
        video: fs.readFileSync(gifPath),
        gifPlayback: true,   // <-- zaroori! is se GIF ki tarah chalega
        caption,
    }, quotedMsg ? { quoted: quotedMsg } : {});
}

/** Video slider bhejo — play button ke saath chalega */
async function sendVideoSlider(sock, from, mp4Path = OUT_MP4,
                               caption = "🎠 *New Collection* 👟",
                               quotedMsg = null) {
    await sock.sendMessage(from, {
        video: fs.readFileSync(mp4Path),
        caption,
    }, quotedMsg ? { quoted: quotedMsg } : {});
}

/* ================= PLUGIN (optional) ================= */
/*
 * plugins/ mein ye lagao:
 *
 *   const { sendGifSlider } = require("../slider-maker.cjs");
 *   export default {
 *       name: "slider", aliases: ["slideshow"],
 *       category: "media", description: "Image slider bhejo",
 *       usage: "-slider",
 *       async execute({ sock, msg, from }) {
 *           await sendGifSlider(sock, from, "./slider.gif",
 *               "🎠 *New Collection* 👟", msg);
 *       },
 *   };
 */

module.exports = { makeGif, makeMp4, sendGifSlider, sendVideoSlider,
                   getSlides };

/* ================= CHALAO ================= */
if (require.main === module) {
    try {
        try { run("ffmpeg -version"); }
        catch { throw new Error("ffmpeg nahi mila! https://ffmpeg.org se install karo."); }

        const files = getSlides(SLIDES_DIR);
        console.log(`📸 ${files.length} images mili:`);
        files.forEach((f) => console.log("   -", f));

        makeGif(files);
        makeMp4(files);
        console.log("\n🎉 Ho gaya! Ab bhejo:");
        console.log("   const { sendGifSlider } = require('./slider-maker.cjs');");
        console.log("   await sendGifSlider(sock, from);");
    } catch (e) {
        console.error("❌", e.message);
        process.exit(1);
    }
}
