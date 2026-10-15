// Check which numbers are actually on WhatsApp before a campaign.
// Uses Baileys onWhatsApp — no message is sent, pure hygiene filter.
const { normPhone, toJid, jidToPhone, bareJid } = require('./util.cjs');

async function filterNumbers(sock, phones, onProgress) {
  const clean = [...new Set((phones || []).map(normPhone).filter(Boolean))];
  const out = [];
  const CHUNK = 40;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const chunk = clean.slice(i, i + CHUNK);
    try {
      const res = await sock.onWhatsApp(...chunk);
      for (const r of res || []) {
        out.push({ phone: jidToPhone(r.jid), on_whatsapp: !!r.exists, jid: bareJid(r.jid) });
      }
    } catch (e) {
      for (const p of chunk) out.push({ phone: p, on_whatsapp: false, jid: toJid(p), error: String(e?.message || e) });
    }
    if (onProgress) { try { onProgress(Math.min(i + CHUNK, clean.length), clean.length); } catch (_) {} }
  }
  return out;
}

module.exports = { filterNumbers };
