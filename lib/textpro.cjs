#!/usr/bin/env node
/**
 * textpro.me — pure axios scraper (zero browser, zero captcha solving)
 *
 * Cracked flow:
 *   1. GET  effect page            -> token, build_server, build_server_id (+ cookies)
 *   2. POST multipart to effect URL -> HTML with #form_value JSON (server-signed!)
 *   3. POST urlencoded to /effect/create-image (poll) -> {success, image}
 *   4. GET  build_server + image    -> the rendered JPG
 *
 * The reCAPTCHA field is submitted EMPTY — the server signs the payload
 * anyway and /effect/create-image accepts it. No browser needed.
 *
 * Usage:
 *   npm i axios jimp@0.22.12
 *   node textpro.cjs --effect <effect-url> --text "AXIOM" [--text "LINE2"] [--out out.jpg] [--nowm | --watermark "9696"]
 *   node textpro.cjs --list <category-url> [--limit 20]
 *   node textpro.cjs --search "fire text" [--site https://textpro.me]
 *
 * Multi-site: the script auto-detects the site from the effect URL, so any
 * clone running this platform works — IF that site doesn't enforce reCAPTCHA.
 * VERIFIED WORKING (2026-10-09):
 *   textpro.me          — text effects, no captcha
 *   en.ephoto360.com    — text/logo/photo effects, NO captcha (main ephoto360.com enforces it!)
 *   birthdaycake24.com  — greeting/birthday cards, no captcha
 * BLOCKED (strict reCAPTCHA): ephoto360.com, photooxy.com
 *
 * Watermark: --nowm blanks the corner mark,
 *            --watermark "TEXT" replaces it with your own text.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SITE = String(process.env.TEXT_PRO_BASE_URL || 'https://textpro.me').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

/** Origin (scheme+host) of any URL — the script auto-adapts to sister sites. */
function siteOf(url) {
  try { return new URL(url).origin; } catch { return DEFAULT_SITE; }
}

/* ---------------- minimal cookie jar (pure axios, no extra deps) ---------------- */
class CookieJar {
  constructor() { this.store = new Map(); }
  ingest(setCookies) {
    if (!setCookies) return;
    for (const c of (Array.isArray(setCookies) ? setCookies : [setCookies])) {
      const pair = c.split(';')[0];
      const i = pair.indexOf('=');
      if (i > 0) this.store.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  header() {
    return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

/* ---------------- tiny HTML entity decoder (no extra deps) ---------------- */
function htmlDecode(s) {
  return s.replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Extract the server-signed payload — handles both site formats:
 *  textpro.me:      <div id="form_value" class="sr-only">{json}</div>
 *  en.ephoto360.com <input name="form_value_input" value="{&quot;json&quot;}"> */
function extractFormValue(html) {
  const container = html.match(/<div\b[^>]*\bid=["']form_value["'][^>]*>([\s\S]*?)<\/div>/i);
  if (container) {
    try { return JSON.parse(htmlDecode(container[1].trim())); } catch {}
  }
  const input = html.match(/<input\b(?=[^>]*\bname=["']form_value(?:_input)?["'])[^>]*>/i);
  if (input) {
    const value = input[0].match(/\bvalue=["']([^"']*)["']/i);
    if (value) {
      try { return JSON.parse(htmlDecode(value[1])); } catch {}
    }
  }
  return null;
}

/* ---------------- hand-rolled multipart (no form-data dep) ---------------- */
function multipart(fields) {
  const boundary = '----AxiomBoundary' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const chunks = [];
  for (const [k, v] of Object.entries(fields)) {
    for (const val of (Array.isArray(v) ? v : [v])) {
      chunks.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${val}\r\n`, 'utf8'));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return { body: Buffer.concat(chunks), boundary };
}

class TextPro {
  constructor(log = () => {}) {
    this.log = log;
    this.jar = new CookieJar();
    // Lazy-load axios so importing the shared bot UI does not initialize the
    // scraper or fail when TextPro commands are unused in a test environment.
    const axios = require('axios');
    this.http = axios.create({
      timeout: 60000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    });
  }

  async _req(method, url, { data = null, headers = {} } = {}) {
    const h = { ...headers };
    const ck = this.jar.header();
    if (ck) h['Cookie'] = ck;
    const res = await this.http.request({ method, url, data, headers: h, responseType: 'arraybuffer' });
    this.jar.ingest(res.headers['set-cookie']);
    return { status: res.status, text: Buffer.from(res.data).toString('utf8'), buf: Buffer.from(res.data), headers: res.headers };
  }

  /** Effect page -> hidden fields + text input count */
  async getEffectMeta(effectUrl) {
    const site = siteOf(effectUrl);
    const { status, text: html } = await this._req('GET', effectUrl);
    if (status !== 200) throw new Error(`GET effect page -> HTTP ${status}`);
    const pick = (name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tag = html.match(new RegExp(`<input\\b(?=[^>]*\\bname=["']${escaped}["'])[^>]*>`, 'i'));
      if (!tag) return '';
      const value = tag[0].match(/\bvalue=["']([^"']*)["']/i);
      return value ? htmlDecode(value[1]) : '';
    };
    const textInputs = (html.match(/\bname\s*=\s*["']text\[\]["']/gi) || []).length;
    return {
      url: effectUrl,
      site,
      token: pick('token'),
      build_server: pick('build_server') || site,
      build_server_id: pick('build_server_id') || '1',
      textInputs: Math.max(textInputs, 1),
    };
  }

  /** Full generation flow -> { imageUrl, imageCode, sessionId } */
  async generate(effectUrl, texts, { pollMs, maxPolls } = {}) {
    if (!Array.isArray(texts)) texts = [texts];
    pollMs = Number.isFinite(Number(pollMs)) ? Math.max(1000, Math.min(15000, Number(pollMs))) : Math.max(1000, Math.min(15000, Number(process.env.TEXT_PRO_POLL_INTERVAL_MS) || 3500));
    maxPolls = Number.isFinite(Number(maxPolls)) ? Math.max(1, Math.min(20, Number(maxPolls))) : Math.max(1, Math.min(20, Number(process.env.TEXT_PRO_MAX_POLL_ATTEMPTS) || 10));
    this.log(`[1/4] GET ${effectUrl}`);
    const meta = await this.getEffectMeta(effectUrl);
    if (!meta.token) throw new Error('No token found — page layout changed?');
    if (texts.length !== meta.textInputs) {
      throw new Error(`This effect expects ${meta.textInputs} text field(s), but ${texts.length} were supplied. Separate multiple fields with |.`);
    }
    this.log(`[2/4] POST form (token ${meta.token.slice(0, 8)}…, ${texts.length} text field(s))`);

    const { body, boundary } = multipart({
      'text[]': texts,
      'token': meta.token,
      'build_server': meta.build_server,
      'build_server_id': meta.build_server_id,
      'grecaptcharesponse': '',
    });
    const post = await this._req('POST', effectUrl, {
      data: body,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Referer': effectUrl },
    });
    const fm = extractFormValue(post.text);
    if (!fm) throw new Error('No #form_value in response — form rejected (captcha? rate-limit?)');
    const payload = fm;
    this.log(`[3/4] signed payload OK (id=${payload.id}), polling /effect/create-image…`);

    // jQuery-style urlencoding: arrays become key[]=v
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(payload)) {
      if (Array.isArray(v)) v.forEach((item) => params.append(`${k}[]`, item));
      else params.append(k, v);
    }
    for (let i = 1; i <= maxPolls; i++) {
      const r = await this._req('POST', `${meta.site}/effect/create-image`, {
        data: params.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': effectUrl,
        },
      });
      let j;
      try { j = JSON.parse(r.text); } catch { j = {}; }
      if (j.success) {
        const imageUrl = meta.build_server.replace(/\/$/, '') + j.image;
        this.log(`[4/4] DONE in ${i} poll(s)`);
        return { imageUrl, imageCode: j.image_code, sessionId: j.session_id, raw: j };
      }
      this.log(`    poll ${i}/${maxPolls}: not ready (${(j.info || '…').slice(0, 40)})`);
      await new Promise((r2) => setTimeout(r2, pollMs));
    }
    throw new Error('Timed out waiting for image — try again later');
  }

  async downloadBuffer(imageUrl) {
    const site = siteOf(imageUrl);
    const { status, buf } = await this._req('GET', imageUrl, { headers: { 'Referer': site + '/' } });
    if (status !== 200 || buf.length < 1000) throw new Error(`Download failed: HTTP ${status}`);
    const contentType = String(buf.slice(0, 8).toString('hex'));
    if (!(contentType.startsWith('ffd8ff') || contentType.startsWith('89504e47') || contentType.startsWith('47494638') || contentType.startsWith('52494646'))) {
      // Some providers return a valid image without a recognizable extension;
      // reject HTML/challenge responses so they are not sent as broken photos.
      const sniff = buf.slice(0, 200).toString('utf8').trimStart().toLowerCase();
      if (sniff.startsWith('<!doctype html') || sniff.startsWith('<html') || sniff.startsWith('{')) {
        throw new Error('TextPro returned a challenge/error page instead of an image. Try later or open the effect page directly.');
      }
    }
    return buf;
  }

  async download(imageUrl, outPath) {
    const buf = await this.downloadBuffer(imageUrl);
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, buf);
    return outPath;
  }

  _parseEffectLinks(html, site, limit = 50) {
    const out = [], seen = new Set();
    const root = new URL(site);
    const pattern = /<a\b([^>]*?)href=["']([^"']+?-\d+\.html(?:\?[^"']*)?)["']([^>]*)>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(pattern)) {
      let parsed;
      try { parsed = new URL(match[2], root); } catch { continue; }
      if (parsed.origin !== root.origin || !/^https?:$/.test(parsed.protocol)) continue;
      parsed.search = '';
      parsed.hash = '';
      const url = parsed.href;
      if (seen.has(url)) continue;
      seen.add(url);
      const attributes = `${match[1]} ${match[3]}`;
      const alt = attributes.match(/(?:alt|title)=["']([^"']+)["']/i)?.[1] || '';
      const rawTitle = match[4].replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0*39;|&#x0*27;/gi, "'").replace(/\s+/g, ' ').trim();
      const slug = parsed.pathname.split('/').pop().replace(/\.html$/i, '').replace(/-\d+$/, '').replace(/-/g, ' ');
      const title = (rawTitle || alt || slug).slice(0, 140);
      out.push({ title, url });
      if (out.length >= Math.max(1, limit)) break;
    }
    return out;
  }

  /** Discover current homepage's New section, with a search-page fallback. */
  async listLatest(limit = 20, site = DEFAULT_SITE, latestUrl = null, heading = 'New') {
    const root = String(site || DEFAULT_SITE).replace(/\/$/, '');
    const pageUrl = latestUrl || `${root}/`;
    const { status, text: html } = await this._req('GET', pageUrl);
    if (status !== 200) throw new Error(`GET effects homepage -> HTTP ${status}`);
    const escapedHeading = String(heading || 'New').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const marker = new RegExp(`<(?:h[1-6]|div|p|strong|span)[^>]*>\\s*${escapedHeading}\\s*<\\/(?:h[1-6]|div|p|strong|span)>`, 'i');
    const hit = marker.exec(html);
    if (hit) {
      const from = hit.index + hit[0].length;
      const rest = html.slice(from);
      const stopMatch = /<(?:h[1-6]|div|p|strong|span)[^>]*>\s*(?:Trending|Top Effects|Category|1\s*-\s*\d+\/\d+)\s*<\/(?:h[1-6]|div|p|strong|span)>/i.exec(rest);
      const section = rest.slice(0, stopMatch ? stopMatch.index : Math.min(rest.length, 120000));
      const found = this._parseEffectLinks(section, root, limit);
      if (found.length) return found;
    }
    // TextPro currently exposes its newest effect cards via its search result
    // page too. If its homepage markup changes, use that as a fallback.
    return this.search(':', limit, root);
  }

  /** List effects on a category page -> [{title, url}] */
  async listEffects(categoryUrl, limit = 50) {
    const site = siteOf(categoryUrl);
    const { status, text: html } = await this._req('GET', categoryUrl);
    if (status !== 200) throw new Error(`GET category -> HTTP ${status}`);
    return this._parseEffectLinks(html, site, limit);
  }

  /** Site search -> [{title, url}] */
  async search(query, limit = 20, site = DEFAULT_SITE) {
    const { status, text: html } = await this._req(
      'GET', `${site.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}`);
    if (status !== 200) throw new Error(`GET search -> HTTP ${status}`);
    return this._parseEffectLinks(html, site, limit);
  }
}

/* ---------------- watermark: remove or replace (needs jimp) ---------------- */
function loadJimp() {
  try { return require('jimp'); }
  catch {
    throw new Error('jimp not installed — run: npm i jimp@0.22.12');
  }
}

/**
 * Blanks the Textpro.me corner mark; optionally stamps your own text there.
 * file is modified in place.
 */
async function processWatermark(file, { text = null } = {}) {
  const Jimp = loadJimp();
  const img = await Jimp.read(file);
  const w = img.bitmap.width, h = img.bitmap.height;
  const s = w / 1000;
  const x0 = Math.max(0, Math.round(w - 235 * s)); // wide enough for long marks like "Birthdaycake24.com"
  const y0 = Math.max(0, Math.round(h - 72 * s));
  const bw = w - x0, bh = h - y0;

  // brightness of the watermark corner -> pick blank + text style
  let sum = 0, n = 0;
  img.scan(x0, y0, bw, bh, function (x, y, idx) {
    sum += (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
    n++;
  });
  const bright = n > 0 && (sum / n) > 128;
  const pureWhite = n > 0 && (sum / n) > 225;

  // 1) blank the original mark
  if (pureWhite) {
    img.composite(new Jimp(bw, bh, 0xffffffff), x0, y0); // white patch
  } else {
    const strip = img.clone().crop(x0, Math.max(0, y0 - bh), bw, bh); // texture from above
    img.composite(strip, x0, y0);
    // feather the seam: blur a slightly larger corner region
    const fx = Math.max(0, x0 - 8), fy = Math.max(0, y0 - 8);
    const fw = Math.min(w - fx, bw + 16), fh = Math.min(h - fy, bh + 16);
    const soft = img.clone().crop(fx, fy, fw, fh);
    soft.blur(3);
    img.composite(soft, fx, fy);
  }

  // 2) stamp custom text (subtle, like the original)
  if (text) {
    const small = w < 700;
    const fp = bright
      ? (small ? Jimp.FONT_SANS_16_BLACK : Jimp.FONT_SANS_32_BLACK)
      : (small ? Jimp.FONT_SANS_16_WHITE : Jimp.FONT_SANS_32_WHITE);
    const font = await Jimp.loadFont(fp);
    const tw = Jimp.measureText(font, text);
    const th = Jimp.measureTextHeight(font, text, w);
    const layer = new Jimp(w, h, 0x00000000);
    layer.print(font, Math.round(w - tw - 18 * s), Math.round(h - th - 14 * s), text);
    layer.opacity(0.55);
    img.composite(layer, 0, 0);
  }

  await img.writeAsync(file);
  return file;
}

/* ---------------- CLI ---------------- */
function parseArgs(argv) {
  const a = { texts: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--effect') a.effect = argv[++i];
    else if (k === '--text') a.texts.push(argv[++i]);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--list') a.list = argv[++i];
    else if (k === '--search') a.search = argv[++i];
    else if (k === '--limit') a.limit = parseInt(argv[++i], 10);
    else if (k === '--nowm') a.nowm = true;
    else if (k === '--watermark') a.watermark = argv[++i];
    else if (k === '--site') a.site = argv[++i];
  }
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const tp = new TextPro((m) => console.log(m));

  if (a.list) {
    const items = await tp.listEffects(a.list, a.limit || 50);
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (a.search) {
    const items = await tp.search(a.search, a.limit || 20, a.site || DEFAULT_SITE);
    console.log(JSON.stringify(items, null, 2));
    return;
  }
  if (!a.effect || !a.texts.length) {
    console.log('Usage:\n' +
      '  node textpro.cjs --effect <url> --text "AXIOM" [--text "LINE2"] [--out out.jpg] [--nowm | --watermark "9696"]\n' +
      '  node textpro.cjs --list <category-url> [--limit 20]\n' +
      '  node textpro.cjs --search "fire text"');
    process.exit(1);
  }
  const res = await tp.generate(a.effect, a.texts);
  console.log('image:', res.imageUrl);
  if (a.out) {
    await tp.download(res.imageUrl, a.out);
    const outPath = path.resolve(a.out);
    console.log('saved:', outPath);
    if (a.watermark) {
      await processWatermark(outPath, { text: a.watermark });
      console.log('watermark ->', a.watermark);
    } else if (a.nowm) {
      await processWatermark(outPath, {});
      console.log('watermark removed');
    }
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
}

module.exports = { TextPro, processWatermark };
