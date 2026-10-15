/**
 * code-design.cjs — Code ko STYLED IMAGE banao 💻✨
 * =================================================
 * Normal text se alag — syntax highlighting + themed background!
 * (Table images wala hi style, code ke liye)
 *
 *   const { codeImage, sendCodeImage } = require("./code-design.cjs");
 *
 *   // PNG buffer banao:
 *   const { buffer, theme } = await codeImage(code, {
 *       theme: "neon",            // ya randomTheme()
 *       filename: "slider.js",
 *       language: "javascript",
 *   });
 *   fs.writeFileSync("code.png", buffer);
 *
 *   // Bot se bhejo:
 *   await sendCodeImage(sock, from, code, { filename: "yt.js" }, msg);
 *
 * Image ke liye: npm i sharp
 */

function getSharp() {
    try { return require("sharp"); }
    catch { throw new Error('code-design: image ke liye "sharp" chahiye. Lagao: npm i sharp'); }
}

/* ==================== THEMES ==================== */
const THEMES = {
    dark:   { card:"#1e1e2e", head:"#2a2a3e", fg:"#cdd6f4", num:"#6c7086",
              keyword:"#cba6f7", string:"#a6e3a1", comment:"#6c7086",
              number:"#fab387", func:"#89b4fa", cls:"#f9e2af", badge:"#cba6f7" },
    light:  { card:"#ffffff", head:"#f1f3f5", fg:"#24292f", num:"#9aa0a6",
              keyword:"#cf222e", string:"#0a3069", comment:"#6e7781",
              number:"#0550ae", func:"#8250df", cls:"#953800", badge:"#8250df" },
    neon:   { card:"#0d0221", head:"#1a0b3d", fg:"#e0e0ff", num:"#5c4d8a",
              keyword:"#ff2fb3", string:"#39ff88", comment:"#5c4d8a",
              number:"#ffe74c", func:"#00e5ff", cls:"#ff9f1c", badge:"#ff2fb3" },
    ocean:  { card:"#06263b", head:"#0a3a5c", fg:"#d7eefc", num:"#4d7a99",
              keyword:"#7dd3fc", string:"#86efac", comment:"#4d7a99",
              number:"#fcd34d", func:"#f0abfc", cls:"#fdba74", badge:"#7dd3fc" },
    sunset: { card:"#2b1a12", head:"#422410", fg:"#ffe8d6", num:"#8a6a55",
              keyword:"#ff8c42", string:"#ffd166", comment:"#8a6a55",
              number:"#ef476f", func:"#06d6a0", cls:"#f78c6b", badge:"#ff8c42" },
    dracula:{ card:"#282a36", head:"#343746", fg:"#f8f8f2", num:"#6272a4",
              keyword:"#ff79c6", string:"#f1fa8c", comment:"#6272a4",
              number:"#bd93f9", func:"#8be9fd", cls:"#50fa7b", badge:"#ff79c6" },
    github: { card:"#0d1117", head:"#161b22", fg:"#e6edf3", num:"#6e7681",
              keyword:"#ff7b72", string:"#a5d6ff", comment:"#8b949e",
              number:"#79c0ff", func:"#d2a8ff", cls:"#ffa657", badge:"#ff7b72" },
};
const themeNames = () => Object.keys(THEMES);
const randomTheme = () => {
    const k = themeNames();
    return k[Math.floor(Math.random() * k.length)];
};

/* ==================== HIGHLIGHTER ==================== */
const KEYWORDS = new Set(
    ("const let var function return if else for while await async import export " +
     "from require module new class extends try catch finally throw switch case " +
     "default break continue typeof in of do this true false null undefined").split(" ")
);

function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightLine(line, t) {
    const re = /(\/\/.*$)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(\d[\d_]*(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)/g;
    let out = "", last = 0, m;
    while ((m = re.exec(line)) !== null) {
        out += esc(line.slice(last, m.index));
        const tok = m[0], comment = m[1], str = m[2], num = m[3], word = m[4];
        if (comment) {
            out += `<tspan fill="${t.comment}" font-style="italic">${esc(tok)}</tspan>`;
        } else if (str) {
            out += `<tspan fill="${t.string}">${esc(tok)}</tspan>`;
        } else if (num) {
            out += `<tspan fill="${t.number}">${esc(tok)}</tspan>`;
        } else if (word && KEYWORDS.has(word)) {
            out += `<tspan fill="${t.keyword}" font-weight="bold">${esc(tok)}</tspan>`;
        } else if (word) {
            const after = line.slice(m.index + tok.length);
            if (/^\s*\(/.test(after))
                out += `<tspan fill="${t.func}">${esc(tok)}</tspan>`;
            else if (/^[A-Z]/.test(word))
                out += `<tspan fill="${t.cls}">${esc(tok)}</tspan>`;
            else out += esc(tok);
        } else out += esc(tok);
        last = m.index + tok.length;
        if (tok.length === 0) re.lastIndex++;
    }
    return out + esc(line.slice(last));
}

/* ==================== SVG BUILDER ==================== */
function codeSVG(code, themeName = randomTheme(), opts = {}) {
    const t = THEMES[themeName] || THEMES.dark;
    const { filename = "code.js", language = "javascript" } = opts;
    const FS = 20, CHAR_W = 12, LINE_H = 34, HEAD_H = 64, PAD = 28, GUT = 64;
    const R = 18;

    const lines = String(code).replace(/\t/g, "    ").split("\n");
    const maxLen = Math.max(10, ...lines.map((l) => l.length));
    const W = Math.min(1400, Math.max(480, GUT + maxLen * CHAR_W + PAD * 2));
    const H = HEAD_H + lines.length * LINE_H + 26;

    let svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
        `font-family="monospace" font-size="${FS}">` +
        `<rect x="0" y="0" width="${W}" height="${H}" rx="${R}" fill="${t.card}"/>` +
        // header
        `<rect x="0" y="0" width="${W}" height="${HEAD_H}" rx="${R}" fill="${t.head}"/>` +
        `<rect x="0" y="${R}" width="${W}" height="${HEAD_H - R}" fill="${t.head}"/>` +
        `<circle cx="34" cy="${HEAD_H / 2}" r="8" fill="#ff5f57"/>` +
        `<circle cx="60" cy="${HEAD_H / 2}" r="8" fill="#febc2e"/>` +
        `<circle cx="86" cy="${HEAD_H / 2}" r="8" fill="#28c840"/>` +
        `<text x="112" y="${HEAD_H / 2 + 7}" fill="${t.fg}" font-weight="bold">${esc(filename)}</text>`;

    // language badge
    const bw = language.length * 12 + 28;
    svg +=
        `<rect x="${W - bw - 20}" y="${HEAD_H / 2 - 16}" width="${bw}" height="32" rx="16" fill="${t.badge}"/>` +
        `<text x="${W - bw / 2 - 20}" y="${HEAD_H / 2 + 7}" fill="${t.card}" font-weight="bold" text-anchor="middle">${esc(language)}</text>`;

    lines.forEach((line, i) => {
        const y = HEAD_H + i * LINE_H + 24;
        svg += `<text x="${GUT / 2}" y="${y}" fill="${t.num}" text-anchor="middle">${i + 1}</text>`;
        const body = highlightLine(line, t) || " ";
        svg += `<text x="${GUT + PAD}" y="${y}" fill="${t.fg}">${body}</text>`;
    });

    svg += "</svg>";
    return { svg, theme: themeName, width: W, height: H };
}

async function codeImage(code, opts = {}) {
    const sharp = getSharp();
    const themeName = opts.theme || randomTheme();
    const { svg, width, height } = codeSVG(code, themeName, opts);
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return { buffer, theme: themeName, width, height };
}

async function sendCodeImage(sock, from, code, opts = {}, quotedMsg = null) {
    const { buffer, theme } = await codeImage(code, opts);
    await sock.sendMessage(from, {
        image: buffer,
        caption: opts.caption || `💻 *${opts.filename || "code.js"}*  ·  theme: ${theme}`,
    }, quotedMsg ? { quoted: quotedMsg } : {});
    return theme;
}

module.exports = {
    THEMES, themeNames, randomTheme,
    codeSVG, codeImage, sendCodeImage,
};

/* demo */
if (require.main === module) {
    (async () => {
        const demo = [
            "// Slider bhejo 🎠",
            "const { sendGifSlider } = require('./slider-maker.cjs');",
            "",
            "async function demo(sock, from, msg) {",
            "    await sock.sendMessage(from, { text: 'Hello!' });",
            "    await sendGifSlider(sock, from, './slider.gif',",
            "        '🎠 New Collection', msg);",
            "    return true;",
            "}",
        ].join("\n");
        for (const th of ["neon", "dracula", "light"]) {
            const { buffer } = await codeImage(demo, {
                theme: th, filename: "slider-demo.js", language: "js",
            });
            require("fs").writeFileSync(`/tmp/code-${th}.png`, buffer);
            console.log("✅", th);
        }
    })().catch((e) => { console.error("❌", e.message); process.exit(1); });
}
