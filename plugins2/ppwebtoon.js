'use strict';

/**
 * ppwebtoon.js — owner-only webtoon/comic commands.
 *
 *   -ppwebtoon <query|series-url>   search WEBTOON (or open a series URL) → episode slider
 *   -ppwebtoonget <episode-url|#>   download episode pages → send images
 *   -pptapas <series-url>           Tapas series → episode slider (search is login-gated)
 *   -pptapasget <episode-url|#>     download Tapas episode pages → send images
 *
 * Episode picking: every episode card has a 📥 GET button whose id carries the
 * episode URL (tap it). If the slider can't render, the text list is numbered
 * and -ppwebtoonget accepts that number (per-chat cache of the last list,
 * 30-minute expiry).
 *
 * Access: owner + secondary owner only (ownerOnly: true).
 */

const {
  webtoonSearchSeries,
  webtoonListEpisodes,
  webtoonEpisodeImages,
  tapasSearchSeries,
  tapasListEpisodes,
  tapasEpisodeImages,
  downloadBuffer,
} = require('./pplib/scrapers.cjs');
const { sendSlider } = require('./pplib/slider.cjs');

const LIST_CACHE_MS = 30 * 60 * 1000;
const PDF_BATCH = 10; // har PDF mein kitni pages

/* ================= JPEG -> PDF (zero dependency) ================= */
function isJpeg(buf) {
  return buf && buf.length > 2 && buf[0] === 0xFF && buf[1] === 0xD8;
}
/** JPEG SOF marker se width/height/components nikalo */
function jpegSize(buf) {
  let i = 2; // SOI skip
  let guard = 0;
  while (i < buf.length - 10 && guard++ < 500) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xC0 || m === 0xC2) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), components: buf[i + 9] };
    }
    if (m === 0xD8 || m === 0xD9 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { i += 2; continue; }
    if (i + 3 >= buf.length) break;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) break;
    i += 2 + len;
  }
  throw new Error('JPEG dimensions nahi milin');
}
/** Minimal PDF builder: har JPEG ek full page. */
function buildPdfFromJpegs(images) {
  const n = images.length;
  if (!n) throw new Error('koi image nahi');
  let out = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1');
  const offsets = {};
  const addObj = (num, body) => {
    offsets[num] = out.length;
    out = Buffer.concat([out, Buffer.from(`${num} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
  };
  const kids = images.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  addObj(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'));
  addObj(2, Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`, 'latin1'));
  images.forEach((img, i) => {
    const pageNum = 3 + i * 3, imgNum = 4 + i * 3, contentNum = 5 + i * 3;
    const name = `Im${i + 1}`;
    const cs = img.components === 1 ? '/DeviceGray' : '/DeviceRGB';
    addObj(pageNum, Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${img.w} ${img.h}] ` +
      `/Resources << /XObject << /${name} ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>`, 'latin1'));
    addObj(imgNum, Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
        `/ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`, 'latin1'),
      img.data,
      Buffer.from('\nendstream', 'latin1'),
    ]));
    const content = `q\n${img.w} 0 0 ${img.h} 0 0 cm\n/${name} Do\nQ\n`;
    addObj(contentNum, Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}endstream`, 'latin1'));
  });
  const total = 3 + n * 3;
  const xrefPos = out.length;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let k = 1; k <= total; k++) xref += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
  out = Buffer.concat([
    out,
    Buffer.from(xref, 'latin1'),
    Buffer.from(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`, 'latin1'),
  ]);
  return out;
}

/** chatId -> { episodes, thumbnail, at } — lets -ppwebtoonget take a list number. */
const recentLists = new Map();

function rememberList(chatId, episodes, thumbnail) {
  const now = Date.now();
  for (const [k, v] of recentLists) {
    if (now - v.at > LIST_CACHE_MS) recentLists.delete(k);
  }
  recentLists.set(chatId, { episodes, thumbnail, at: now });
}

function lookupNumber(chatId, n) {
  const entry = recentLists.get(chatId);
  if (!entry || Date.now() - entry.at > LIST_CACHE_MS) return null;
  const newest = [...entry.episodes].sort((a, b) => (b.no || 0) - (a.no || 0));
  return newest[n - 1] || null;
}

async function deleteQuiet(sock, chatId, key) {
  try { await sock.sendMessage(chatId, { delete: key }); } catch { /* ignore */ }
}

const isUrl = (s) => /^https?:\/\//i.test(String(s || ''));

const FALLBACK_ICON = {
  webtoons: 'https://www.google.com/s2/favicons?domain=webtoons.com&sz=128',
  tapas: 'https://www.google.com/s2/favicons?domain=tapas.io&sz=128',
};

/** Newest-first, capped. */
function newestFirst(episodes, n = 12) {
  return [...episodes].sort((a, b) => (b.no || 0) - (a.no || 0)).slice(0, n);
}

function numberedListText(siteLabel, seriesTitle, author, episodes, total, prefix, getCmd) {
  const newest = newestFirst(episodes, 12);
  const lines = newest.map((e, i) =>
    `${i + 1}. #${e.no != null ? e.no : '?'} ${(e.title || 'Untitled').slice(0, 50)}${e.free === false ? ' 🔒' : ''}`
  );
  return [
    `📚 *${seriesTitle.slice(0, 80)}*`,
    `📁 ${siteLabel}${author ? ` • ✍️ ${author}` : ''} • ${total} episodes`,
    '',
    ...lines,
    '',
    `📥 ${prefix}${getCmd} <number>  (e.g. ${prefix}${getCmd} 3)`,
    `or ${prefix}${getCmd} <episode-url>`,
    `➕ add "full" for ONE complete PDF: ${prefix}${getCmd} 3 full`,
    `📕 default: 10 pages per PDF`,
  ].join('\n');
}

/**
 * Show episodes as a slider (each card: 📥 GET button with the episode URL).
 * Falls back to the numbered text list.
 */
async function showEpisodes(sock, chatId, message, { site, siteLabel, seriesTitle, author, episodes, thumbnail, prefix, getCmd }) {
  rememberList(chatId, episodes, thumbnail);
  const newest = newestFirst(episodes, 12);
  const shown = await sendSlider(sock, chatId, {
    bodyText: `📚 *${seriesTitle.slice(0, 60)}*\n📁 ${siteLabel}${author ? ` • ✍️ ${author}` : ''} • ${episodes.length} episodes\n\nTap 📥 GET on any episode`,
    footerText: 'Owner only',
    maxCards: 12,
    items: newest.map((e, i) => ({
      title: `${i + 1}. #${e.no != null ? e.no : '?'} ${(e.title || 'Untitled').slice(0, 45)}`,
      body: `${e.date || ''}${e.free === false ? '\n🔒 locked' : ''}\n${(e.title || '').slice(0, 100)}`,
      footer: siteLabel,
      imageUrl: thumbnail || FALLBACK_ICON[site],
      buttons: [{ text: '📥 GET', id: `${prefix}${getCmd} ${e.url}` }],
    })),
  });
  if (shown) return;
  await sock.sendMessage(chatId, {
    text: numberedListText(siteLabel, seriesTitle, author, episodes, episodes.length, prefix, getCmd),
  }, { quoted: message });
}

/** Resolve the -get argument: full URL, or a number from the chat's last list. */
function resolveEpisodeArg(chatId, arg, prefix, getCmd) {
  const input = String(arg || '').trim();
  if (isUrl(input)) return { url: input };
  if (/^\d{1,3}$/.test(input)) {
    const ep = lookupNumber(chatId, parseInt(input, 10));
    if (ep) return { url: ep.url };
    return {
      error: `❌ No episode #${input} in this chat's last list (it expires after 30 min).\nRun ${prefix}${getCmd === 'ppwebtoonget' ? 'ppwebtoon' : 'pptapas'} again, then use its number.`,
    };
  }
  return {
    error: `📥 *EPISODE DOWNLOAD*\n\nUsage: ${prefix}${getCmd} <number>\nor: ${prefix}${getCmd} <episode-url>\n\nGet the number from the episode list, or tap 📥 GET on a slider card.`,
  };
}

/** Episode ki saari pages download karke PDF(s) mein bhejo.
 *  Default: har 10 pages = 1 PDF. `full=true` par poora episode = 1 PDF.
 */
async function sendEpisodeImages(sock, chatId, message, getImages, episodeUrl, referer, siteLabel, full = false) {
  const working = await sock.sendMessage(chatId,
    { text: `📥 Fetching episode pages from *${siteLabel}*…` }, { quoted: message });
  try {
    const ep = await getImages(episodeUrl);
    const total = Array.isArray(ep?.images) ? ep.images.length : 0;
    if (!total) throw new Error('Is episode mein koi image nahi mili.');
    await sock.sendMessage(chatId, {
      text: `📥 *${total} pages* milin — ${full ? 'one complete PDF' : `${Math.ceil(total / PDF_BATCH)} PDF batches (10 pages each)`} ban rahi hain…`,
    }, { quoted: message });
    await deleteQuiet(sock, chatId, working.key);

    const title = (ep.title || 'Episode').slice(0, 60).replace(/[^\w\- ]+/g, '').trim() || 'episode';
    const siteTag = siteLabel.toLowerCase().replace(/\s+/g, '');
    const skipped = [];
    let part = 0;
    let sentPages = 0;

    const downloadBatch = async (urls, offset) => {
      const images = [];
      for (let i = 0; i < urls.length; i += 4) {
        const chunk = urls.slice(i, i + 4);
        const results = await Promise.all(chunk.map(async (url, local) => {
          const pageNo = offset + i + local + 1;
          try {
            const r = await downloadBuffer(url, referer);
            const b = r.buffer || r;
            if (!b || !isJpeg(b)) throw new Error('not-jpeg');
            const { w, h, components } = jpegSize(b);
            return { data: b, w, h, components };
          } catch {
            skipped.push(pageNo);
            return null;
          }
        }));
        for (const item of results) if (item) images.push(item);
        await new Promise((r) => setTimeout(r, 100));
      }
      return images;
    };

    if (full) {
      // Explicit `full` mode: one PDF containing every successfully downloaded page.
      const images = await downloadBatch(ep.images, 0);
      if (!images.length) throw new Error('Koi usable JPEG page download nahi hui.');
      const pdf = buildPdfFromJpegs(images);
      const fileName = `${siteTag}-${title}-full.pdf`;
      await sock.sendMessage(chatId, {
        document: pdf,
        mimetype: 'application/pdf',
        fileName,
        caption: `📕 *${(ep.title || 'Episode').slice(0, 80)}*\n📄 ${fileName} — ${images.length}/${total} pages`,
      }, { quoted: message });
      sentPages = images.length;
      part = 1;
    } else {
      // Default: exactly 10 source pages per PDF. Each batch is released before the next.
      for (let base = 0; base < total; base += PDF_BATCH) {
        const endPage = Math.min(base + PDF_BATCH, total);
        const images = await downloadBatch(ep.images.slice(base, endPage), base);
        if (!images.length) continue;
        part++;
        const pdf = buildPdfFromJpegs(images);
        const fileName = `${siteTag}-${title}-part${part}.pdf`;
        await sock.sendMessage(chatId, {
          document: pdf,
          mimetype: 'application/pdf',
          fileName,
          caption: `📕 *${(ep.title || 'Episode').slice(0, 80)}*\n📄 ${fileName} — ${images.length} pages (${endPage}/${total})`,
        }, { quoted: message });
        sentPages += images.length;
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (!part && !sentPages) throw new Error('Koi usable JPEG page download nahi hui.');
    await sock.sendMessage(chatId, {
      text: `✅ *Ho gaya!* ${full ? '1 complete PDF' : `${part} PDF`} (${sentPages}/${total} pages)${skipped.length ? `\n⚠️ ${skipped.length} pages skip: ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? '…' : ''}` : ''}`,
    }, { quoted: message });
  } catch (e) {
    await deleteQuiet(sock, chatId, working.key);
    await sock.sendMessage(chatId,
      { text: `❌ *${siteLabel}*: ${String(e.message || e).slice(0, 300)}` },
      { quoted: message });
  }
}

const ppwebtoon = {
  command: 'ppwebtoon',
  aliases: ['ppwt', 'ppwebtoonsearch'],
  category: 'owner',
  ownerOnly: true,
  description: 'Owner-only WEBTOON series search + episode slider',
  usage: '-ppwebtoon <search|series-url>',
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || '-';
    const input = (Array.isArray(args) ? args : []).map(String).filter(Boolean).join(' ').trim();
    if (!input) {
      return sock.sendMessage(chatId, {
        text: `📚 *WEBTOON SEARCH*\n\nUsage: ${prefix}ppwebtoon <search>\nor: ${prefix}ppwebtoon <series-url>\nExample: ${prefix}ppwebtoon tower of god`,
      }, { quoted: message });
    }
    const working = await sock.sendMessage(chatId, { text: '🔎 Searching *WEBTOON*…' }, { quoted: message });
    try {
      let seriesUrl = input;
      let seriesTitle = 'WEBTOON series';
      let author = null;
      let thumbnail = null;
      if (!isUrl(input)) {
        const hits = await webtoonSearchSeries(input, 5);
        if (!hits.length) throw new Error(`No series found for "${input}".`);
        seriesUrl = hits[0].url;
        seriesTitle = hits[0].title;
        author = hits[0].author;
        thumbnail = hits[0].thumbnail;
      }
      // Newest episodes first: page 1 of the list holds the latest.
      const episodes = await webtoonListEpisodes(seriesUrl, 8);
      await deleteQuiet(sock, chatId, working.key);
      return showEpisodes(sock, chatId, message, {
        site: 'webtoons', siteLabel: 'WEBTOON',
        seriesTitle, author, episodes, thumbnail,
        prefix, getCmd: 'ppwebtoonget',
      });
    } catch (e) {
      await deleteQuiet(sock, chatId, working.key);
      return sock.sendMessage(chatId,
        { text: `❌ *WEBTOON*: ${String(e.message || e).slice(0, 300)}` },
        { quoted: message });
    }
  },
};

const ppwebtoonget = {
  command: 'ppwebtoonget',
  aliases: ['ppwtget'],
  category: 'owner',
  ownerOnly: true,
  description: 'Owner-only download of a WEBTOON episode as PDF(s) (URL or list number)',
  usage: '-ppwebtoonget <number|episode-url> [full]',
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || '-';
    const arr = Array.isArray(args) ? args : [];
    const resolved = resolveEpisodeArg(chatId, arr[0], prefix, 'ppwebtoonget');
    if (resolved.error) {
      return sock.sendMessage(chatId, { text: resolved.error }, { quoted: message });
    }
    const full = arr.slice(1).some((a) => /^full$/i.test(String(a || '').trim()));
    return sendEpisodeImages(sock, chatId, message, webtoonEpisodeImages, resolved.url,
      'https://www.webtoons.com/', 'WEBTOON', full);
  },
};

const pptapas = {
  command: 'pptapas',
  aliases: ['pptp'],
  category: 'owner',
  ownerOnly: true,
  description: 'Owner-only Tapas series episode slider (series URL; search is login-gated)',
  usage: '-pptapas <series-url>',
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || '-';
    const input = (Array.isArray(args) ? args : []).map(String).filter(Boolean).join(' ').trim();
    if (!input) {
      return sock.sendMessage(chatId, {
        text: `📚 *TAPAS SERIES*\n\nUsage: ${prefix}pptapas <series-url>\nExample: ${prefix}pptapas https://tapas.io/series/12345/info\n\n⚠️ Tapas search needs login, so paste a series URL directly.`,
      }, { quoted: message });
    }
    if (!isUrl(input) || !/tapas\.io\/series\//i.test(input)) {
      try { await tapasSearchSeries(input, 1); }
      catch (e) {
        return sock.sendMessage(chatId, {
          text: `⚠️ ${String(e.message).slice(0, 250)}\n\nPaste a series URL instead:\n${prefix}pptapas https://tapas.io/series/<id>/info`,
        }, { quoted: message });
      }
    }
    const working = await sock.sendMessage(chatId, { text: '🔎 Loading *Tapas* series…' }, { quoted: message });
    try {
      const episodes = await tapasListEpisodes(input);
      await deleteQuiet(sock, chatId, working.key);
      return showEpisodes(sock, chatId, message, {
        site: 'tapas', siteLabel: 'Tapas',
        seriesTitle: 'Tapas series', author: null, episodes,
        thumbnail: null, prefix, getCmd: 'pptapasget',
      });
    } catch (e) {
      await deleteQuiet(sock, chatId, working.key);
      return sock.sendMessage(chatId,
        { text: `❌ *Tapas*: ${String(e.message || e).slice(0, 300)}` },
        { quoted: message });
    }
  },
};

const pptapasget = {
  command: 'pptapasget',
  aliases: ['pptpget'],
  category: 'owner',
  ownerOnly: true,
  description: 'Owner-only download of a Tapas episode as PDF(s) (URL or list number)',
  usage: '-pptapasget <number|episode-url> [full]',
  async handler(sock, message, args = [], context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const prefix = context.prefix || '-';
    const arr = Array.isArray(args) ? args : [];
    const resolved = resolveEpisodeArg(chatId, arr[0], prefix, 'pptapasget');
    if (resolved.error) {
      return sock.sendMessage(chatId, { text: resolved.error }, { quoted: message });
    }
    const full = arr.slice(1).some((a) => /^full$/i.test(String(a || '').trim()));
    return sendEpisodeImages(sock, chatId, message, tapasEpisodeImages, resolved.url,
      'https://tapas.io/', 'Tapas', full);
  },
};

module.exports = [ppwebtoon, ppwebtoonget, pptapas, pptapasget];
