/**
 * html-bubble.cjs
 *
 * Reusable renderer for "HTML-looking" WhatsApp bubbles.
 * - Full HTML -> PNG via Puppeteer when available.
 * - SVG -> PNG via the bot's existing sharp dependency (no extra package).
 *
 * WhatsApp receives a normal image message, so the HTML/SVG is rendered on the
 * bot side instead of being sent as a .html document that opens in a browser.
 */
'use strict';

const crypto = require('crypto');

let puppeteer = null;
try { puppeteer = require('puppeteer'); } catch { puppeteer = null; }

let sharp = null;
try { sharp = require('sharp'); } catch { sharp = null; }

class BubbleRenderer {
  constructor(opts = {}) {
    this.width = opts.width || 800;
    this.scale = opts.scale || 2;
    this.timeout = opts.timeout || 15000;
    this.maxPages = opts.maxPages || 3;
    this.browser = null;
    this.pagePool = [];
    this.activePages = 0;
    this.cache = new Map();
    this.cacheLimit = opts.cacheLimit || 12;
    this.launching = null;
  }

  async _launch() {
    if (!puppeteer) throw new Error('PUPPETEER_MISSING');
    if (this.browser) return this.browser;
    if (!this.launching) {
      this.launching = puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      }).then((browser) => {
        this.browser = browser;
        return browser;
      }).catch((err) => {
        this.launching = null;
        throw err;
      });
    }
    return this.launching;
  }

  async _acquirePage() {
    await this._launch();
    if (this.pagePool.length) return this.pagePool.pop();
    if (this.activePages >= this.maxPages) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      return this._acquirePage();
    }
    this.activePages += 1;
    const page = await this.browser.newPage();
    await page.setViewport({
      width: this.width,
      height: 600,
      deviceScaleFactor: this.scale,
    });
    return page;
  }

  _releasePage(page) {
    if (this.pagePool.length < this.maxPages) this.pagePool.push(page);
    else {
      this.activePages -= 1;
      page.close().catch(() => {});
    }
  }

  _wrap(html, theme = 'dark') {
    const bg = theme === 'light' ? '#ffffff' : '#0b0f14';
    const fg = theme === 'light' ? '#111111' : '#f2f2f2';
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;padding:0}
      body{background:${bg};color:${fg};font-family:'Segoe UI',system-ui,sans-serif;
      padding:28px;width:${this.width}px}
    </style></head><body>${html}</body></html>`;
  }

  async render(html, opts = {}) {
    if (!puppeteer) throw new Error('PUPPETEER_MISSING');
    if (typeof html !== 'string' || !html.trim()) throw new TypeError('HTML is empty.');

    const fullHtml = this._wrap(html, opts.theme || 'dark');
    const key = crypto.createHash('sha256').update(fullHtml).digest('hex');
    if (opts.cache !== false && this.cache.has(key)) return this.cache.get(key);

    const page = await this._acquirePage();
    try {
      await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: this.timeout });
      const height = await page.evaluate(() => document.body.scrollHeight);
      await page.setViewport({
        width: this.width,
        height: Math.min(Math.max(height, 100), 4000),
        deviceScaleFactor: this.scale,
      });
      const buffer = await page.screenshot({ type: 'png', fullPage: false });
      if (opts.cache !== false) this._cacheSet(key, buffer);
      return buffer;
    } finally {
      this._releasePage(page);
    }
  }

  async renderSvg(svg, opts = {}) {
    if (!sharp) throw new Error('SHARP_MISSING');
    if (typeof svg !== 'string' || !svg.trim()) throw new TypeError('SVG is empty.');

    const key = crypto.createHash('sha256').update(svg).digest('hex');
    if (opts.cache !== false && this.cache.has(key)) return this.cache.get(key);

    const buffer = await sharp(Buffer.from(svg, 'utf8'), { density: opts.density || 192 })
      .png({ compressionLevel: Number.isInteger(opts.compressionLevel) ? opts.compressionLevel : 6 })
      .toBuffer();
    if (opts.cache !== false) this._cacheSet(key, buffer);
    return buffer;
  }

  _cacheSet(key, buffer) {
    this.cache.set(key, buffer);
    if (this.cache.size > this.cacheLimit) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
  }

  async close() {
    for (const page of this.pagePool) await page.close().catch(() => {});
    this.pagePool = [];
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
    this.launching = null;
    this.activePages = 0;
  }
}

const renderer = new BubbleRenderer();

async function sendSvgBubble(sock, jid, svg, opts = {}) {
  if (!svg || !svg.trim()) return false;
  try {
    const buffer = await renderer.renderSvg(svg, opts);
    await sock.sendMessage(
      jid,
      { image: buffer, caption: opts.caption || '', ...(opts.noForward ? { _skipForwardContext: true } : {}) },
      opts.quoted ? { quoted: opts.quoted } : {}
    );
    return true;
  } catch (err) {
    await sock.sendMessage(jid, {
      text: '❌ Ping card render failed:\n' + String(err.message || err).slice(0, 220),
    });
    return false;
  }
}

async function sendHtmlBubble(sock, jid, html, opts = {}) {
  if (!html || !html.trim()) return false;
  if (!puppeteer) {
    await sock.sendMessage(jid, {
      text: '❌ *HTML renderer unavailable.*\nInstall `puppeteer` for `-htmlbubble`.\n\nSVG cards such as `-ping` use the existing `sharp` dependency and do not need Puppeteer.',
    });
    return true;
  }

  const waitMsg = await sock.sendMessage(jid, { text: '🎨 *Rendering…*' });
  try {
    const buffer = await renderer.render(html, opts);
    try { await sock.sendMessage(jid, { delete: waitMsg.key }); } catch {}
    await sock.sendMessage(
      jid,
      { image: buffer, caption: opts.caption || '', ...(opts.noForward ? { _skipForwardContext: true } : {}) },
      opts.quoted ? { quoted: opts.quoted } : {}
    );
    return true;
  } catch (err) {
    try { await sock.sendMessage(jid, { delete: waitMsg.key }); } catch {}
    await sock.sendMessage(jid, {
      text: '❌ Render failed:\n' + String(err.message || err).slice(0, 220),
    });
    return true;
  }
}

function getText(msg) {
  return (msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || '').trim();
}

async function handleHtmlBubble(sock, msg) {
  const text = getText(msg);
  const first = text.split(/\s+/)[0]?.toLowerCase();
  if (first !== '-htmlbubble' && first !== '-hb') return false;
  const jid = msg.key.remoteJid;
  const html = text.slice(first.length).trim();
  if (!html) {
    await sock.sendMessage(jid, {
      text: '🖼️ *HTML Bubble*\n\nUse:\n`-htmlbubble <h1 style="color:#bef264">Hello</h1>`',
    }, { quoted: msg });
    return true;
  }
  await sendHtmlBubble(sock, jid, html, { quoted: msg });
  return true;
}

process.on('SIGINT', () => renderer.close());
process.on('SIGTERM', () => renderer.close());

module.exports = {
  BubbleRenderer,
  renderer,
  sendSvgBubble,
  sendHtmlBubble,
  handleHtmlBubble,
};
