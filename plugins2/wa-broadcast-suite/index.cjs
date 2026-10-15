// WA Broadcast Suite — multi-line Baileys manager + owner command router.
// Owner-only commands (prefix from config, default "-"). CommonJS.
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { getText, tokenize, bareJid } = require('./lib/util.cjs');
const { loadRules, matchRule } = require('./lib/autoresponder.cjs');

const ROOT = __dirname;

function loadConfig() {
  const cfgPath = path.join(ROOT, 'config.json');
  const exPath = path.join(ROOT, 'config.example.json');
  if (!fs.existsSync(cfgPath)) {
    fs.copyFileSync(exPath, cfgPath);
    console.log('Created config.json from the example. Edit your owner number + lines, then run again.');
    process.exit(0);
  }
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

function loadPlugins() {
  const dir = path.join(ROOT, 'plugins');
  const cmdMap = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.cjs')) continue;
    const p = require(path.join(dir, f));
    Object.assign(cmdMap, p.commands || {});
  }
  return cmdMap;
}

async function connectLine(ctx, lineCfg) {
  const line = ctx.lines.find((l) => l.id === lineCfg.id) || { id: lineCfg.id, sock: null, ready: false, jid: null };
  if (!ctx.lines.includes(line)) ctx.lines.push(line);

  const { state, saveCreds } = await useMultiFileAuthState(path.join(ROOT, 'auth', lineCfg.id));
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch (_) { version = [2, 3000, 1015901307]; }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }),
    browser: ['WA Broadcast Suite', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  line.sock = sock;
  line.ready = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect } = u;
    if (connection === 'open') {
      line.ready = true;
      line.jid = bareJid(sock.user?.id || '');
      console.log(`[${line.id}] connected as ${line.jid}`);
    }
    if (connection === 'close') {
      line.ready = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`[${line.id}] connection closed (${code})`);
      if (code !== DisconnectReason.loggedOut) {
        console.log(`[${line.id}] reconnecting in 5s...`);
        setTimeout(() => connectLine(ctx, lineCfg).catch((e) => console.error(`[${line.id}] reconnect failed`, e.message)), 5000);
      } else {
        console.log(`[${line.id}] LOGGED OUT. Delete auth/${lineCfg.id}/ and restart, then scan the QR again.`);
      }
    }
  });

  // Delivery / read receipts -> campaign tracking
  sock.ev.on('message-receipt.update', (updates) => {
    for (const u of updates || []) {
      const id = u.key?.id;
      if (!id) continue;
      const level = u.receipt?.readTimestamp ? 'read' : u.receipt?.receiptTimestamp ? 'delivered' : null;
      if (!level) continue;
      for (const c of ctx.campaigns.values()) {
        if (c.markReceipt(id, level)) { try { c.save(); } catch (_) {} break; }
      }
    }
  });

  // Collect contacts seen by the session
  sock.ev.on('contacts.upsert', (cs) => {
    for (const c of cs || []) {
      if (c.id && c.id.endsWith('@s.whatsapp.net')) ctx.contacts.set(bareJid(c.id), c.name || c.notify || '');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages || []) {
      if (m.key.remoteJid === 'status@broadcast') continue;
      await onMessage(ctx, line, m).catch((e) => console.error('onMessage error:', e.message));
    }
  });

  return line;
}

async function onMessage(ctx, line, msg) {
  if (!msg.message) return;
  const text = getText(msg).trim();
  if (!text) return;
  const chatJid = bareJid(msg.key.remoteJid);
  const senderJid = bareJid(msg.key.participant || msg.key.remoteJid || '');
  const isOwner = msg.key.fromMe || (ctx.config.owners || []).map(bareJid).includes(senderJid);
  const prefix = ctx.config.prefix || '-';
  const isCmd = text.startsWith(prefix);
  const reply = (t, extra = {}) => line.sock.sendMessage(chatJid, { text: t, ...extra }, { quoted: msg });

  // 1) survey answers (anyone, non-commands)
  if (!isCmd && !msg.key.fromMe) {
    for (const s of ctx.surveys.values()) {
      if (s.record(senderJid, text)) {
        const nq = s.nextQuestion(senderJid);
        if (nq) await line.sock.sendMessage(senderJid, { text: nq }).catch(() => {});
        return;
      }
    }
  }

  // 2) autoresponder (anyone except owner commands), 5-min cooldown per chat
  if (!isCmd && !msg.key.fromMe) {
    const rule = matchRule(loadRules(ctx.dataDir), text);
    if (rule) {
      const last = ctx.arCooldown.get(chatJid) || 0;
      if (Date.now() - last > 5 * 60 * 1000) {
        ctx.arCooldown.set(chatJid, Date.now());
        await reply(rule.reply).catch(() => {});
      }
      return;
    }
  }

  // 3) owner commands
  if (!isCmd || !isOwner) return;
  const parts = tokenize(text);
  const cmd = parts[0].slice(prefix.length).toLowerCase();
  const args = parts.slice(1);
  const fn = ctx.cmdMap[cmd];
  if (!fn) { await reply(`Unknown command: ${cmd}\nSend ${prefix}menu for the command list.`).catch(() => {}); return; }
  try {
    await fn({ ...ctx, line, msg, reply, chatJid, senderJid, prefix }, args, text);
  } catch (e) {
    await reply(`Error: ${e.message}`).catch(() => {});
  }
}

async function main() {
  const config = loadConfig();
  const ctx = {
    config,
    dataDir: path.join(ROOT, config.dataDir || './data'),
    lines: [],
    campaigns: new Map(),
    surveys: new Map(),
    contacts: new Map(),
    arCooldown: new Map(),
    groupCache: [],
    cmdMap: loadPlugins(),
    warmer: null,
  };
  fs.mkdirSync(ctx.dataDir, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'inbox'), { recursive: true });

  console.log(`WA Broadcast Suite starting — ${(config.lines || []).length} line(s), prefix "${config.prefix || '-'}"`);
  console.log('Scan the QR code(s) with WhatsApp > Linked devices.');
  for (const lc of config.lines || []) {
    await connectLine(ctx, lc).catch((e) => console.error(`[${lc.id}] connect failed:`, e.message));
  }
  // keep process alive
  setInterval(() => {}, 60_000);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
