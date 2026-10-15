const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const settings = require('../settings');
const commandHandler = require('../lib/commandHandler');
const { isOwnerOnly } = require('../lib/isOwner');
const gemini = require('../lib/geminiService');

const ROOT = path.resolve(process.cwd());
const BACKUP_ROOT = path.join(ROOT, '.abix-backups');
const MAX_READ = Number(process.env.ABIX_MAX_READ_SIZE) || 50000;
const MAX_UPLOAD = 32 * 1024 * 1024;
const confirmations = new Map();
const cookiePending = new Map();
const protectedPath = /(^|[\\/])(?:\.env(?:\.[^\\/]+)?|\.abix-backups|session|cookies?(?:\.[^\\/]+)?|credentials?|private|secret|token|apikey|api[_-]?key)(?:[\\/]|$)/i;

function cleanSender(id) {
  return String(id || '').split(':')[0].split('@')[0];
}

function resolvePath(input, allowProtected = false) {
  if (!input) throw new Error('Path is required.');
  const target = path.resolve(ROOT, input);
  if (target !== ROOT && !target.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error('Path outside project is not allowed.');
  }
  if (!allowProtected && protectedPath.test(path.relative(ROOT, target))) {
    throw new Error('Protected path cannot be accessed from WhatsApp.');
  }
  return target;
}

function relative(file) {
  return path.relative(ROOT, file) || '.';
}

function reply(sock, message, context, text) {
  return sock.sendMessage(context.chatId || message.key.remoteJid, { text }, { quoted: message });
}

function validateFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`JavaScript validation failed: ${(result.stderr || '').trim().slice(-800)}`);
  } else if (ext === '.json') {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } else if (ext === '.py') {
    const python = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
    const result = spawnSync(python, ['-m', 'py_compile', file], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error(`Python validation failed: ${(result.stderr || '').trim().slice(-800)}`);
  }
}

function backup(target) {
  if (!fs.existsSync(target) || String(process.env.ABIX_BACKUP_ENABLED || 'true').toLowerCase() === 'false') return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(BACKUP_ROOT, stamp, relative(target));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(target, destination, { recursive: true, force: false });
  return relative(destination);
}

function atomicWrite(target, content) {
  const temporary = `${target}.abix-tmp${path.extname(target)}`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 });
  try {
    validateFile(temporary);
    const backupPath = backup(target);
    fs.renameSync(temporary, target);
    return backupPath;
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
}

function normalizeCookie(raw) {
    let data = raw;
    if (Buffer.isBuffer(data)) data = data.toString('utf8');
    if (typeof data === 'string') {
      data = data.trim();
      try { data = JSON.parse(data); } catch {}
    }
    if (Array.isArray(data)) {
      const entries = data.filter(item => item && item.name && typeof item.value === 'string');
      const cookie = entries.map(item => `${item.name}=${item.value}`).join('; ');
      const sapisid = entries.find(item => item.name === 'SAPISID')?.value || '';
      data = { cookie, sapisid };
    }
    if (!data || typeof data !== 'object' || typeof data.cookie !== 'string' || typeof data.sapisid !== 'string') {
      throw new Error('Use the upstream JSON format: {"cookie":"name=value; ...","sapisid":"SAPISID value"}');
    }
    if (!data.cookie.trim() || !data.sapisid.trim() || !/(^|;\s*)SAPISID=/.test(data.cookie)) {
      throw new Error('Cookie JSON must contain a non-empty cookie string and SAPISID.');
    }
    return JSON.stringify({ cookie: data.cookie.trim(), sapisid: data.sapisid.trim() }, null, 2) + '\n';
}

function cookieKey(context) {
    return `${cleanSender(context.senderId)}|${context.chatId}`;
}

async function updateCookie(raw) {
    const file = gemini.cookieFile();
    const normalized = normalizeCookie(raw);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const old = fs.existsSync(file) ? fs.readFileSync(file) : null;
    const backupPath = old ? `${file}.${Date.now()}.bak` : null;
    if (old) fs.writeFileSync(backupPath, old, { mode: 0o600 });
    const temporary = `${file}.tmp`;
    try {
      fs.writeFileSync(temporary, normalized, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, file);
      gemini.restartGemini();
      const healthy = await gemini.waitForHealthy(15000);
      const authenticated = healthy && await gemini.verifyAuthentication(20000);
      if (!authenticated) throw new Error('Gemini authentication failed.');
      return backupPath;
    } catch {
      try { fs.rmSync(temporary, { force: true }); } catch {}
      if (old) fs.writeFileSync(file, old, { mode: 0o600 });
      else fs.rmSync(file, { force: true });
      gemini.restartGemini();
      throw new Error('Gemini authentication failed. Check Gemini cookie configuration.');
    }
}

async function handlePendingCookieMessage(sock, message, senderId, chatId) {
    if (!isOwnerOnly(senderId)) return false;
    const key = `${cleanSender(senderId)}|${chatId}`;
    const pending = cookiePending.get(key);
    if (!pending || pending.expires < Date.now()) {
      cookiePending.delete(key);
      return false;
    }
    cookiePending.delete(key);
    try {
      let raw;
      const target = mediaTarget(message);
      if (target.message?.documentMessage) raw = await downloadMediaMessage(target, 'buffer', {}, { logger: undefined });
      else raw = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
      await updateCookie(raw);
      await sock.sendMessage(chatId, { text: '✅ Gemini cookie updated successfully.\n\n🔄 Gemini Web2API restarted.\n🟢 Authentication successful.' }, { quoted: message });
    } catch {
      await sock.sendMessage(chatId, { text: '❌ Gemini cookie update failed.\n\nThe previous cookie is still active.' }, { quoted: message });
    }
    return true;
}

function mediaTarget(message) {
  const context = message.message?.extendedTextMessage?.contextInfo;
  if (!context?.quotedMessage) return message;
  return {
    key: {
      remoteJid: message.key.remoteJid,
      id: context.stanzaId,
      participant: context.participant,
    },
    message: context.quotedMessage,
  };
}

function requireConfirmation(context, action, source, destination) {
  const token = Math.random().toString(36).slice(2, 8).toUpperCase();
  confirmations.set(token, {
    sender: cleanSender(context.senderId),
    chatId: context.chatId,
    action,
    source,
    destination,
    expires: Date.now() + Number(process.env.ABIX_CONFIRM_TIMEOUT || 60000),
  });
  return token;
}

function consumeConfirmation(context, token) {
  const key = String(token || '').toUpperCase();
  const entry = confirmations.get(key);
  confirmations.delete(key);
  if (!entry || entry.expires <= Date.now()) return null;
  if (entry.sender !== cleanSender(context.senderId) || entry.chatId !== context.chatId) return null;
  return entry;
}

function tree(dir, prefix = '', output = []) {
  if (output.length >= 150) return output;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(item => !protectedPath.test(item.name));
  entries.forEach((entry, index) => {
    const last = index === entries.length - 1;
    output.push(`${prefix}${last ? '└── ' : '├── '}${entry.name}`);
    if (entry.isDirectory()) tree(path.join(dir, entry.name), `${prefix}${last ? '    ' : '│   '}`, output);
  });
  return output;
}

async function handler(sock, message, args, context = {}) {
  const chatId = context.chatId || message.key.remoteJid;
  if (!context.isOwnerOnly && !context.isPrimaryOwner && !isOwnerOnly(context.senderId)) {
    return sock.sendMessage(chatId, { text: '❌ Primary owner only command.' }, { quoted: message });
  }
  const action = String(args.shift() || 'help').toLowerCase();
  try {
    if (action === 'help') {
      return reply(sock, message, context, [
        '🛡️ ABIX OWNER FILE MANAGER',
        '-abixadmin ls [path]  •  -abixadmin tree',
        '-abixadmin read <file>  •  -abixadmin stat <file>  •  -abixadmin find <query>',
        '-abixadmin write <file> <text>  •  -abixadmin append <file> <text>  •  -abixadmin update <file> <text>',
        '-abixadmin rename <old> <new>  •  -abixadmin delete <file>  •  -abixadmin mkdir <dir>  •  -abixadmin rmdir <dir>',
        '-abixadmin download <file>  •  -abixadmin upload <path> (reply to media/file)',
        '-abixadmin status  •  -abixadmin gemini  •  -abixadmin reload  •  -abixadmin restart',
        'Destructive actions require: -abixadmin confirm <code>',
      ].join('\n'));
    }
    if (action === 'status') {
      return reply(sock, message, context, [
        '🤖 ABIX STATUS',
        'Bot: 🟢 Online',
        'WhatsApp: 🟢 Connected',
        `Gemini: ${gemini.status().running ? '🟢 Running' : '⚪ Unavailable'}`,
        'HTTP Server: 🟢 Running',
        `Plugins: 🟢 ${commandHandler.commands.size} loaded`,
        `Uptime: ${Math.floor(process.uptime())}s`,
      ].join('\n'));
    }
    if (action === 'gemini') {
      const status = gemini.status();
      return reply(sock, message, context, [
        '🤖 GEMINI WEB2API',
        `Status: ${status.running ? '🟢 Running' : '⚪ Unavailable'}`,
        `Host: ${status.host}`,
        `Port: ${status.port}`,
        'API: /v1',
        `Model: ${status.model}`,
        `Authentication: ${status.cookie.configured ? '🟢 Configured' : '⚪ Not configured'}`,
        `Cookie: ${status.cookie.loaded ? '🟢 Loaded' : '⚪ Not loaded'}`,
      ].join('\n'));
    }
    if (action === 'setcookie' || action === 'updatecookie' || action === 'geminicookie') {
      cookiePending.set(cookieKey(context), { expires: Date.now() + 120000 });
      return reply(sock, message, context, 'Send the new Gemini cookie/config file now. Use the upstream JSON format: {"cookie":"name=value; ...","sapisid":"SAPISID value"}');
    }
    if (action === 'reload') {
      commandHandler.reloadCommands();
      return reply(sock, message, context, `✅ Plugins reloaded: ${commandHandler.commands.size}`);
    }
    if (action === 'restart') {
      await reply(sock, message, context, '♻️ Restarting ABIX-AE...\nReason: Owner requested restart.');
      return setTimeout(() => process.exit(0), 250);
    }
    if (action === 'confirm') {
      const entry = consumeConfirmation(context, args.shift());
      if (!entry) return reply(sock, message, context, '❌ Invalid or expired confirmation code.');
      const backupPath = backup(entry.source);
      if (entry.action === 'delete' || entry.action === 'rmdir') {
        if (entry.action === 'rmdir' && !fs.statSync(entry.source).isDirectory()) throw new Error('rmdir requires a directory.');
        fs.rmSync(entry.source, { recursive: entry.action === 'rmdir', force: false });
      } else {
        if (fs.existsSync(entry.destination)) throw new Error('Destination already exists.');
        fs.renameSync(entry.source, entry.destination);
      }
      return reply(sock, message, context, `✅ ${entry.action} complete${backupPath ? `\nBackup: ${backupPath}` : ''}`);
    }
    if (action === 'ls' || action === 'list') {
      const dir = resolvePath(args[0] || '.');
      if (!fs.statSync(dir).isDirectory()) throw new Error('Not a directory.');
      const names = fs.readdirSync(dir, { withFileTypes: true }).filter(item => !protectedPath.test(item.name))
        .map(item => `${item.isDirectory() ? '📁' : '📄'} ${item.name}`);
      return reply(sock, message, context, names.join('\n') || '📂 Empty directory.');
    }
    if (action === 'tree') {
      return reply(sock, message, context, `📁 ${path.basename(ROOT)}\n${tree(ROOT).join('\n')}`);
    }
    if (action === 'read') {
      const file = resolvePath(args.shift());
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw new Error('Not a file.');
      if (stat.size > MAX_READ) throw new Error(`File exceeds the ${MAX_READ}-byte read limit.`);
      return reply(sock, message, context, `📄 ${relative(file)}\n\n${fs.readFileSync(file, 'utf8')}`);
    }
    if (action === 'stat') {
      const file = resolvePath(args.shift());
      const stat = fs.statSync(file);
      return reply(sock, message, context, `📄 FILE INFORMATION\nPath: ${relative(file)}\nSize: ${stat.size} bytes\nModified: ${stat.mtime.toISOString()}\nType: ${stat.isDirectory() ? 'Directory' : 'File'}`);
    }
    if (action === 'find' || action === 'search') {
      const query = String(args.shift() || '').toLowerCase();
      const base = resolvePath(args.shift() || '.');
      if (!query) throw new Error('Search query is required.');
      const hits = [];
      const walk = dir => {
        if (hits.length >= 100) return;
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          if (protectedPath.test(item.name)) continue;
          const full = path.join(dir, item.name);
          if (item.isDirectory()) walk(full);
          else if (item.name.toLowerCase().includes(query)) hits.push(relative(full));
        }
      };
      walk(base);
      return reply(sock, message, context, hits.join('\n') || '🔎 No files found.');
    }
    if (action === 'write' || action === 'update' || action === 'append') {
      const file = resolvePath(args.shift());
      const text = args.join(' ');
      if (!text) throw new Error('Text is required.');
      if (Buffer.byteLength(text) > MAX_READ) throw new Error(`Text exceeds the ${MAX_READ}-byte limit.`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      let backupPath;
      if (action === 'append') {
        const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        backupPath = atomicWrite(file, `${existing}${text}`);
      } else {
        backupPath = atomicWrite(file, text);
      }
      return reply(sock, message, context, `✅ ${action} complete: ${relative(file)}${backupPath ? `\nBackup: ${backupPath}` : ''}`);
    }
    if (action === 'mkdir') {
      const dir = resolvePath(args.shift());
      fs.mkdirSync(dir, { recursive: true });
      return reply(sock, message, context, `✅ Created directory: ${relative(dir)}`);
    }
    if (action === 'download') {
      const file = resolvePath(args.shift());
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw new Error('Not a file.');
      if (stat.size > MAX_UPLOAD) throw new Error('File exceeds the 32 MB download limit.');
      return sock.sendMessage(chatId, { document: fs.readFileSync(file), fileName: path.basename(file), mimetype: 'application/octet-stream' }, { quoted: message });
    }
    if (action === 'upload') {
      const destination = resolvePath(args.shift());
      const target = mediaTarget(message);
      const media = target.message?.documentMessage || target.message?.imageMessage || target.message?.videoMessage;
      if (!media) throw new Error('Reply to a file/media with `-abix upload <path>`.');
      const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger: undefined });
      if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_UPLOAD) throw new Error('Upload is empty or exceeds 32 MB.');
      const backupPath = backup(destination);
      const temporary = `${destination}.abix-tmp${path.extname(destination)}`;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(temporary, buffer, { mode: 0o600 });
      try {
        validateFile(temporary);
        fs.renameSync(temporary, destination);
      } catch (error) {
        try { fs.rmSync(temporary, { force: true }); } catch {}
        throw error;
      }
      return reply(sock, message, context, `✅ Uploaded ${relative(destination)}${backupPath ? `\nBackup: ${backupPath}` : ''}`);
    }
    if (action === 'delete' || action === 'rmdir' || action === 'rename') {
      const source = resolvePath(args.shift());
      const destination = action === 'rename' ? resolvePath(args.shift()) : null;
      const token = args.shift();
      if (!token) {
        const code = requireConfirmation(context, action, source, destination);
        return reply(sock, message, context, `⚠️ Confirm ${action} for ${relative(source)}\nReply with: -abix confirm ${code}`);
      }
      const entry = consumeConfirmation(context, token);
      if (!entry || entry.action !== action || entry.source !== source || entry.destination !== destination) {
        return reply(sock, message, context, '❌ Invalid or expired confirmation code.');
      }
      const backupPath = backup(source);
      if (action === 'delete' || action === 'rmdir') {
        if (action === 'rmdir' && !fs.statSync(source).isDirectory()) throw new Error('rmdir requires a directory.');
        fs.rmSync(source, { recursive: action === 'rmdir', force: false });
      } else {
        if (fs.existsSync(destination)) throw new Error('Destination already exists.');
        fs.renameSync(source, destination);
      }
      return reply(sock, message, context, `✅ ${action} complete${backupPath ? `\nBackup: ${backupPath}` : ''}`);
    }
    throw new Error('Unknown action. Use `-abixadmin help`.');
  } catch (error) {
    return reply(sock, message, context, `❌ ${error.message}`);
  }
}

module.exports = {
  // Shared implementation only. The public command is registered by
  // plugins2/abixadmin.js so there is no duplicate -abix menu command.
  handler,
  handlePendingCookieMessage,
};
