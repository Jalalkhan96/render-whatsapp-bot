const fs = require('fs');
const path = require('path');
const store = require('../lib/lightweight_store');
const { resolveOwner } = require('../lib/owner');

const SETTINGS_KEY = 'warnings';
const LEGACY_FILE = path.join(process.cwd(), 'data', 'warnings.json');

function targetFromMessage(message, args = []) {
  const ctx = message?.message?.extendedTextMessage?.contextInfo || {};
  const mentions = Array.isArray(ctx.mentionedJid) ? ctx.mentionedJid : [];
  if (mentions.length) return mentions[0];
  if (ctx.participant) return ctx.participant;
  const raw = String(args[0] || '').replace(/[^0-9:]/g, '');
  if (raw.length >= 7) return raw.includes('@') ? raw : `${raw}@s.whatsapp.net`;
  return null;
}

async function getWarnings(chatId) {
  let data = await store.getSetting(chatId, SETTINGS_KEY);
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  try {
    if (fs.existsSync(LEGACY_FILE)) {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));
      if (legacy?.[chatId] && typeof legacy[chatId] === 'object') return legacy[chatId];
    }
  } catch (e) { console.error('[WARN STORE] legacy read:', e.message); }
  return {};
}
async function saveWarnings(chatId, data) {
  await store.saveSetting(chatId, SETTINGS_KEY, data || {});
}

async function groupMembers(sock, chatId) {
  const metadata = await sock.groupMetadata(chatId);
  return Array.isArray(metadata?.participants) ? metadata.participants : [];
}
function sameIdentity(a,b) {
  const strip = v => String(v || '').split(':')[0].split('@')[0];
  return Boolean(a && b && (String(a) === String(b) || strip(a) === strip(b)));
}
async function memberRecord(sock, chatId, jid, participants) {
  const list = participants || await groupMembers(sock, chatId);
  return list.find(p => [p.id,p.lid,p.phoneNumber,p.jid,p.pn].some(x => sameIdentity(x,jid))) || null;
}
async function protectedTarget(sock, chatId, jid) {
  const owner = await resolveOwner(jid, sock, chatId);
  if (owner.isOwner || owner.isBotIdentity) return { protected:true, reason:'owner or bot' };
  const member = await memberRecord(sock, chatId, jid);
  if (member?.admin) return { protected:true, reason:'group admin' };
  return { protected:false, member };
}

async function addWarning(chatId, jid) {
  const warnings = await getWarnings(chatId);
  const key = String(jid);
  const count = Number(warnings[key] || 0) + 1;
  warnings[key] = count;
  await saveWarnings(chatId, warnings);
  return count;
}
async function clearWarning(chatId, jid) {
  const warnings = await getWarnings(chatId);
  delete warnings[String(jid)];
  await saveWarnings(chatId, warnings);
}
module.exports = { targetFromMessage, getWarnings, saveWarnings, groupMembers, memberRecord, protectedTarget, addWarning, clearWarning };
