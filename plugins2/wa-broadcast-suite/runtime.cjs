'use strict';

const fs = require('fs');
const path = require('path');
const { loadRules, matchRule } = require('./lib/autoresponder.cjs');
const { bareJid } = require('./lib/util.cjs');
const { Warmer } = require('./lib/warmer.cjs');

const BOT_ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(BOT_ROOT, 'data', 'wa-broadcast-suite');
const INBOX_DIR = path.join(__dirname, 'inbox');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');

for (const dir of [DATA_DIR, REPORTS_DIR, INBOX_DIR]) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

const state = {
  line: { id: 'main', sock: null, ready: false, jid: null },
  lines: [],
  campaigns: new Map(),
  surveys: new Map(),
  contacts: new Map(),
  arCooldown: new Map(),
  groupCache: [],
  warmer: new Warmer(),
};

state.lines.push(state.line);

function pruneRuntimeMaps() {
  const now = Date.now();
  const arCutoff = now - 5 * 60 * 1000;
  for (const [jid, ts] of state.arCooldown) {
    if (ts < arCutoff) state.arCooldown.delete(jid);
  }
  if (state.arCooldown.size > 5000) {
    while (state.arCooldown.size > 3500) {
      const first = state.arCooldown.keys().next();
      if (first.done) break;
      state.arCooldown.delete(first.value);
    }
  }

  for (const [id, survey] of state.surveys) {
    if (!survey || Date.now() > survey.deadline) state.surveys.delete(id);
  }
  if (state.surveys.size > 100) {
    while (state.surveys.size > 75) {
      const first = state.surveys.keys().next();
      if (first.done) break;
      state.surveys.delete(first.value);
    }
  }
}

const sweep = setInterval(pruneRuntimeMaps, 5 * 60 * 1000);
sweep.unref?.();

function bindSocket(sock) {
  if (!sock) return state.line;
  state.line.sock = sock;
  state.line.ready = Boolean(sock?.user);
  state.line.jid = bareJid(sock?.user?.id || '') || null;
  return state.line;
}

function buildContext(sock, msg, baseContext = {}) {
  const line = bindSocket(sock);
  const chatJid = msg?.key?.remoteJid || baseContext.chatId || '';
  const senderJid = msg?.key?.participant || msg?.key?.senderPn || chatJid;
  const prefix = baseContext.prefix || '-';

  return {
    config: { prefix },
    dataDir: DATA_DIR,
    inboxDir: INBOX_DIR,
    reportsDir: REPORTS_DIR,
    lines: state.lines,
    line,
    campaigns: state.campaigns,
    surveys: state.surveys,
    contacts: state.contacts,
    arCooldown: state.arCooldown,
    groupCache: state.groupCache,
    warmer: state.warmer,
    msg,
    chatJid,
    senderJid: bareJid(senderJid),
    prefix,
    isOwner: Boolean(baseContext.isOwner || baseContext.isOwnerCheck),
    reply: async (text, extra = {}) => sock.sendMessage(chatJid, { text: String(text ?? ''), ...extra }, { quoted: msg }),
  };
}

async function handleIncoming(sock, msg, text, senderJid, isOwner = false) {
  const value = String(text || '').trim();
  if (!value || msg?.key?.fromMe || isOwner) return false;

  const prefix = process.env.PREFIX || '-';
  if (value.startsWith(prefix)) return false;

  bindSocket(sock);
  pruneRuntimeMaps();
  state.contacts.set(bareJid(senderJid), msg?.pushName || '');

  // Survey replies have priority over autoresponder rules.
  for (const [id, survey] of state.surveys) {
    if (!survey) { state.surveys.delete(id); continue; }
    if (Date.now() > survey.deadline) { state.surveys.delete(id); continue; }
    if (survey.record(senderJid, value)) {
      const next = survey.nextQuestion(senderJid);
      if (next) {
        await sock.sendMessage(senderJid, { text: next }).catch(() => {});
      }
      return true;
    }
  }

  // Autoresponder is deliberately opt-in via -autoreply rules and is
  // throttled per chat so it cannot generate a message loop.
  try {
    const rule = matchRule(loadRules(DATA_DIR), value);
    if (rule) {
      const chatJid = msg?.key?.remoteJid;
      const last = state.arCooldown.get(chatJid) || 0;
      if (Date.now() - last > 5 * 60 * 1000) {
        state.arCooldown.set(chatJid, Date.now());
        await sock.sendMessage(chatJid, { text: rule.reply }).catch(() => {});
      }
      return true;
    }
  } catch (_) {}

  return false;
}

module.exports = {
  BOT_ROOT,
  DATA_DIR,
  INBOX_DIR,
  REPORTS_DIR,
  state,
  bindSocket,
  buildContext,
  handleIncoming,
};
