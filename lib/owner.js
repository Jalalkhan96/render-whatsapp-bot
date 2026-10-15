'use strict';

const settings = require('../settings');

function normalizeIdentity(value) {
  if (!value) return '';
  let raw = String(value).trim();
  if (!raw) return '';

  // Common Baileys JID formats: 923...@s.whatsapp.net, 923...:device@s.whatsapp.net,
  // LIDs and number strings. Only numbers are used for phone-number comparison.
  let normalized = raw
    .replace(/^\+/, '')
    .split(':')[0]
    .split('@')[0]
    .replace(/\D/g, '');

  // Pakistan local number convenience: 03XXXXXXXXX -> 923XXXXXXXXX.
  if (normalized.length === 11 && normalized.startsWith('0')) {
    normalized = `92${normalized.slice(1)}`;
  } else if (normalized.length === 10 && normalized.startsWith('3')) {
    normalized = `92${normalized}`;
  }
  return normalized;
}

function unique(values) {
  return [...new Set((values || []).map(normalizeIdentity).filter(Boolean))];
}

function primaryOwnerNumber() {
  return normalizeIdentity(settings.ownerNumber);
}

function secondaryOwnerNumbers() {
  return unique(settings.secondaryOwnerNumbers);
}

function ownerNumbers() {
  return unique([primaryOwnerNumber(), ...secondaryOwnerNumbers()]);
}

function botNumber(sock) {
  const values = [
    sock?.user?.id,
    sock?.user?.jid,
    sock?.user?.phoneNumber,
    sock?.authState?.creds?.me?.id,
  ];
  return values.map(normalizeIdentity).find(Boolean) || '';
}

function isBotIdentity(value, sock) {
  const normalized = normalizeIdentity(value);
  const bot = botNumber(sock);
  return Boolean(normalized && bot && normalized === bot);
}

function isPrimaryOwner(value) {
  const normalized = normalizeIdentity(value);
  return Boolean(normalized && normalized === primaryOwnerNumber());
}

function isSecondaryOwner(value) {
  const normalized = normalizeIdentity(value);
  return Boolean(normalized && secondaryOwnerNumbers().includes(normalized));
}

function isOwner(value) {
  return isPrimaryOwner(value) || isSecondaryOwner(value);
}

async function mapLidToPhone(sock, jid) {
  if (!sock || !jid || !String(jid).endsWith('@lid')) return null;
  try {
    const mapping = sock?.signalRepository?.lidMapping;
    if (mapping && typeof mapping.getPNForLID === 'function') {
      return await mapping.getPNForLID(jid);
    }
  } catch {}
  return null;
}

async function findGroupParticipant(sock, chatId, senderId) {
  if (!sock || !String(chatId || '').endsWith('@g.us') || !senderId) return null;
  try {
    const metadata = await sock.groupMetadata(chatId);
    const target = String(senderId);
    const targetNormalized = normalizeIdentity(target);
    return (metadata?.participants || []).find((participant) => {
      const identities = [
        participant?.id,
        participant?.lid,
        participant?.phoneNumber,
        participant?.jid,
        participant?.pn,
      ].filter(Boolean);
      return identities.some((identity) => String(identity) === target) ||
        (targetNormalized && identities.some((identity) => normalizeIdentity(identity) === targetNormalized));
    }) || null;
  } catch {
    return null;
  }
}

async function resolveOwner(senderId, sock, chatId) {
  const initial = String(senderId || '').trim();
  const candidates = new Set([initial]);

  // LID -> phone mapping is the authoritative bridge when available.
  const mappedPhone = await mapLidToPhone(sock, initial);
  if (mappedPhone) candidates.add(mappedPhone);

  // Group metadata can also expose both LID and phone identities.
  const participant = await findGroupParticipant(sock, chatId, initial);
  for (const value of [participant?.id, participant?.lid, participant?.phoneNumber, participant?.jid, participant?.pn]) {
    if (value) candidates.add(value);
  }

  const candidateList = [...candidates];
  const primary = candidateList.find(isPrimaryOwner) || null;
  const secondary = candidateList.find(isSecondaryOwner) || null;
  const bot = candidateList.find(candidate => isBotIdentity(candidate, sock)) || null;
  const resolvedId = primary || secondary || bot || candidateList[0] || null;

  return {
    isOwner: Boolean(primary || secondary || bot),
    isPrimaryOwner: Boolean(primary),
    isSecondaryOwner: Boolean(secondary && !primary),
    isBotIdentity: Boolean(bot),
    resolvedId,
    matchedIdentity: primary || secondary || bot || null,
  };
}

module.exports = {
  normalizeIdentity,
  primaryOwnerNumber,
  secondaryOwnerNumbers,
  ownerNumbers,
  botNumber,
  isBotIdentity,
  isPrimaryOwner,
  isSecondaryOwner,
  isOwner,
  resolveOwner,
  findGroupParticipant,
};
