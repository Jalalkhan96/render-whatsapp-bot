'use strict';

const { resolveOwner } = require('./owner');
const { normalizeMessageContent, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
let JSZip = null;
function getJSZip() {
  if (JSZip) return JSZip;
  try {
    JSZip = require('jszip');
    return JSZip;
  } catch (error) {
    const wrapped = new Error('Bix ZIP support requires the `jszip` package. Run `npm install --no-audit --no-fund` after applying this update.');
    wrapped.code = 'MISSING_JSZIP';
    wrapped.cause = error;
    throw wrapped;
  }
}
const { sendRichMarkdown } = require('./richCodeBridge.cjs');

let bixAIImport = null;
let bixStoreImport = null;
const replyMap = new Map();
const REPLY_TTL = 24 * 60 * 60 * 1000;

function loadBixAI() {
  if (!bixAIImport) bixAIImport = import('./bix/bixAI.js');
  return bixAIImport;
}

function loadBixStore() {
  if (!bixStoreImport) bixStoreImport = import('./bix/bixStore.js');
  return bixStoreImport;
}

function unwrap(msg) {
  let current = msg;
  for (let i = 0; i < 8 && current; i++) {
    if (current.ephemeralMessage?.message) { current = current.ephemeralMessage.message; continue; }
    if (current.viewOnceMessageV2?.message) { current = current.viewOnceMessageV2.message; continue; }
    if (current.viewOnceMessage?.message) { current = current.viewOnceMessage.message; continue; }
    if (current.viewOnceMessageV2Extension?.message) { current = current.viewOnceMessageV2Extension.message; continue; }
    if (current.documentWithCaptionMessage?.message) { current = current.documentWithCaptionMessage.message; continue; }
    break;
  }
  return current || null;
}

function bodyText(message) {
  const content = normalizeMessageContent(message?.message || {}) || unwrap(message?.message);
  return String(
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    ''
  ).trim();
}

function parseBixTrigger(text) {
  const clean = String(text || '').trim();
  if (!clean) return null;

  const patterns = [
    /^@bix\s*(.*)$/is,
    /^-@bix\s*(.*)$/is,
    /^-bix\s*(.*)$/is,
    /^bix\s+(.*)$/is,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) return { active: true, question: String(match[1] || '').trim() };
  }
  if (/^(?:@bix|-@bix|-bix|bix)$/i.test(clean)) return { active: true, question: '' };
  return null;
}

function rememberReply(messageId, chatId) {
  if (!messageId || !chatId) return;
  replyMap.set(String(messageId), { chatId, createdAt: Date.now() });
}

function cleanupReplies() {
  const now = Date.now();
  for (const [id, item] of replyMap) {
    if (!item || now - item.createdAt > REPLY_TTL) replyMap.delete(id);
  }
}

function quotedBixQuestion(message) {
  const content = message?.message?.extendedTextMessage?.contextInfo;
  const quotedId = content?.stanzaId || content?.quotedMessageId;
  if (!quotedId) return null;
  const remembered = replyMap.get(String(quotedId));
  if (!remembered || Date.now() - remembered.createdAt > REPLY_TTL) {
    replyMap.delete(String(quotedId));
    return null;
  }
  const text = bodyText(message);
  if (!text) return null;
  return { chatId: remembered.chatId, quotedId: String(quotedId), text };
}


function attachmentTarget(message) {
  const current = unwrap(message?.message);
  if (current?.documentMessage || current?.imageMessage || current?.videoMessage) {
    return { key: message.key, message: current };
  }
  const ctx = current?.extendedTextMessage?.contextInfo || {};
  if (ctx?.quotedMessage) {
    const quoted = unwrap(ctx.quotedMessage);
    if (quoted?.documentMessage || quoted?.imageMessage || quoted?.videoMessage) {
      return {
        key: { remoteJid: message.key.remoteJid, fromMe: false, id: ctx.stanzaId, participant: ctx.participant },
        message: quoted,
      };
    }
  }
  return null;
}

function safeAttachmentName(name) {
  const clean = String(name || 'attachment.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean.slice(-140) || 'attachment.bin';
}

async function stageAttachment(message) {
  const target = attachmentTarget(message);
  if (!target) return null;
  const media = target.message?.documentMessage || target.message?.imageMessage || target.message?.videoMessage;
  if (!media) return null;
  const max = Number(process.env.BIX_MAX_ATTACHMENT_BYTES || 45 * 1024 * 1024);
  const dir = path.join(process.cwd(), 'data', 'bix-inbox');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const original = safeAttachmentName(media.fileName || (media.mimetype?.split('/')[1] ? `attachment.${media.mimetype.split('/')[1]}` : 'attachment.bin'));
  const filePath = path.join(dir, `${Date.now()}-${original}`);
  const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger: undefined });
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Attached file is empty.');
  if (buffer.length > max) throw new Error(`Attached file exceeds Bix limit of ${Math.round(max / 1024 / 1024)} MB.`);
  fs.writeFileSync(filePath, buffer, { mode: 0o600 });
  return {
    path: path.relative(process.cwd(), filePath).split(path.sep).join('/'),
    name: original,
    mimetype: String(media.mimetype || 'application/octet-stream'),
    size: buffer.length,
  };
}

function trimQuestion(text) {
  const value = String(text || '').trim();
  return value.length > 7000 ? value.slice(0, 7000) : value;
}

async function isBixOwner(senderId, sock, chatId) {
  const resolved = await resolveOwner(senderId, sock, chatId);
  return resolved.isOwner;
}

async function sendBix(sock, message, chatId, text) {
  const sent = await sock.sendMessage(chatId, { text }, { quoted: message });
  if (sent?.key?.id) rememberReply(sent.key.id, chatId);
  return sent;
}

async function runBix({ sock, message, chatId, senderId, question }) {
  const ownerAllowed = await isBixOwner(senderId, sock, chatId);
  if (!ownerAllowed) {
    await sock.sendMessage(chatId, { text: '🔒 @bix is available only to the configured primary owner and secondary owner.' }, { quoted: message });
    return true;
  }

  global.__BIX_CHAT_ID__ = chatId;
  let attachment = null;
  try { attachment = await stageAttachment(message); } catch (attachmentError) {
    await sendBix(sock, message, chatId, `❌ Attachment staging failed: ${attachmentError.message}`);
    return true;
  }

  const [{ askBix, isBixConfigured, isBixReady, getBixConfig }, store] = await Promise.all([loadBixAI(), loadBixStore()]);
  try {
    const toolsModule = await import('./bix/bixTools.js');
    const runtimeModule = await import('./bix/botRuntime.js');
    if (typeof toolsModule.setBixSocket === 'function') toolsModule.setBixSocket(sock);
    if (typeof runtimeModule.setBixRuntimeSocket === 'function') runtimeModule.setBixRuntimeSocket(sock);
    global.__BIX_SOCKET__ = sock;
  } catch (wireError) {
    throw new Error(`Bix runtime wiring failed: ${wireError.message}`);
  }
  if (!isBixConfigured()) {
    await sendBix(sock, message, chatId,
      '❌ *Bix AI is not configured.*\n\nGemini Web2API is unavailable or GEMINI_URL is missing.');
    return true;
  }

  if (typeof isBixReady === 'function' && !(await isBixReady(4000))) {
    await sendBix(sock, message, chatId,
      '❌ *Bix AI gateway is not ready.*\n\nThe Gemini Web2API service is not responding. Check the Gemini service startup/health state, then try `-bix` again.');
    return true;
  }

  const request = trimQuestion(question) || 'Introduce yourself as Bix and show the main capabilities available to the bot owner.';
  const history = await store.getBixHistory(chatId);

  try { await sock.sendPresenceUpdate('composing', chatId); } catch {}

  try {
    const result = await askBix({
      message: attachment
        ? `${request}\n\n[ATTACHED FILE]
Project-relative path: ${attachment.path}
Original name: ${attachment.name}
MIME: ${attachment.mimetype}
Size: ${attachment.size} bytes\nUse inspectZip/extractZip for ZIP archives; use readFile after extraction for source files.`
        : request,
      history,
      userId: senderId,
      chatId,
    });

    if (result?.answer) {
      await store.appendBixMessage(chatId, 'user', request);
      await store.appendBixMessage(chatId, 'assistant', result.answer);
      const sent = /```[\w#+.-]*\n?[\s\S]*?```/.test(String(result.answer))
      ? await sendRichMarkdown(sock, chatId, String(result.answer), { quoted: message })
      : await sock.sendMessage(chatId, { text: result.answer }, { quoted: message });
      if (sent?.key?.id) rememberReply(sent.key.id, chatId);
    }

    return true;
  } catch (error) {
    await sendBix(sock, message, chatId,
      `❌ *Bix error*\n\n${error?.message || 'Bix request failed.'}\n\nGateway: ${getBixConfig()?.endpoint || 'http://127.0.0.1:8081/v1/chat/completions'}`);
    return true;
  } finally {
    try { await sock.sendPresenceUpdate('paused', chatId); } catch {}
  }
}

const ZIP_SKIP_PARTS = new Set(['node_modules', '.git']);
const KNOWN_ROOTS = new Set(['plugins','plugin2','plugins2','plugin4','esportplugin','lib','src','data','config','public','assets','scripts','package.json','package-lock.json','index.js','server.js']);

function unwrapZipMessage(messageLike) {
  const content = normalizeMessageContent(messageLike?.message || {}) || unwrap(messageLike?.message || {});
  if (!content) return null;
  if (content.documentMessage) return content.documentMessage;
  const quoted = content.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted) {
    const q = normalizeMessageContent(quoted) || unwrap(quoted);
    if (q?.documentMessage) return q.documentMessage;
  }
  return null;
}

function normalizeArchivePath(input) {
  let value = String(input || '').replace(/\\/g, '/');
  if (!value || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:\//.test(value)) return null;
  value = path.posix.normalize(value).replace(/^\.\//, '').replace(/^\/+/, '');
  if (!value || value === '.' || value === '..' || value.startsWith('../') || value.includes('/../')) return null;
  const parts = value.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '..' || part === '.')) return null;
  if (/^plugin2$/i.test(parts[0]) || /^plugins2$/i.test(parts[0])) parts[0] = 'plugins2';
  if (ZIP_SKIP_PARTS.has(parts[0])) return null;
  return parts.join('/');
}

function detectCommonWrapper(paths) {
  const files = paths.filter(Boolean);
  const first = files[0]?.split('/')[0];
  if (!first || KNOWN_ROOTS.has(first)) return '';
  if (files.every((item) => item.split('/')[0] === first)) return first + '/';
  return '';
}

async function documentToBuffer(documentMessage) {
  if (!documentMessage?.url) throw new Error('ZIP document media is unavailable.');
  const stream = await downloadContentFromMessage(documentMessage, 'document', {});
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) throw new Error('ZIP document is empty.');
  return buffer;
}

async function extractBixZip(message) {
  const document = unwrapZipMessage(message);
  if (!document) return null;
  const fileName = String(document.fileName || '').trim() || 'upload.zip';
  const mimetype = String(document.mimetype || '').toLowerCase();
  if (!/\.zip$/i.test(fileName) && !mimetype.includes('zip')) return null;

  const ownerRoot = process.cwd();
  const buffer = await documentToBuffer(document);
  const zip = await getJSZip().loadAsync(buffer, { createFolders: false, checkCRC32: false });
  const rawEntries = Object.values(zip.files || {}).filter((entry) => entry && !entry.dir);
  if (!rawEntries.length) throw new Error('ZIP contains no files.');

  const rawPaths = rawEntries.map((entry) => String(entry.name || '').replace(/\\/g, '/'));
  const wrapper = detectCommonWrapper(rawPaths);
  const backupRoot = path.join(ownerRoot, 'data', 'bix-backups', `zip-${Date.now()}`);
  let written = 0, overwritten = 0, skipped = 0;
  const writtenPaths = [];

  for (const entry of rawEntries) {
    let rel = String(entry.name || '').replace(/\\/g, '/');
    if (wrapper && rel.startsWith(wrapper)) rel = rel.slice(wrapper.length);
    rel = normalizeArchivePath(rel);
    if (!rel) { skipped++; continue; }
    const dest = path.resolve(ownerRoot, rel);
    if (dest !== ownerRoot && !dest.startsWith(ownerRoot + path.sep)) { skipped++; continue; }

    const payload = await entry.async('nodebuffer');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest)) {
      const backup = path.join(backupRoot, rel);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(dest, backup);
      overwritten++;
    }
    fs.writeFileSync(dest, payload);
    written++;
    writtenPaths.push(rel);
  }

  return {
    fileName,
    total: rawEntries.length,
    written,
    overwritten,
    skipped,
    backupRoot: overwritten ? path.relative(ownerRoot, backupRoot) : null,
    roots: [...new Set(writtenPaths.map((item) => item.split('/')[0]))].sort(),
  };
}

async function handleDirectBix({ sock, message, chatId, senderId }) {
  cleanupReplies();
  if (!message?.message || !chatId || !senderId) return false;

  const direct = parseBixTrigger(bodyText(message));
  if (direct) {
    const ownerAllowed = await isBixOwner(senderId, sock, chatId);
    if (!ownerAllowed) {
      await sock.sendMessage(chatId, { text: '🔒 @bix is available only to the configured primary owner and secondary owner.' }, { quoted: message });
      return true;
    }
    try {
      const extracted = await extractBixZip(message);
      if (extracted) {
        let reloadText = '';
        try {
          const commandHandler = require('./commandHandler');
          commandHandler.reloadCommands();
          const report = commandHandler.getLoadReport();
          reloadText = `\n🔄 Command registry reloaded: ${report.loaded} commands`;
          if (report.broken) reloadText += `\n⚠️ Broken plugins after import: ${report.broken}`;
        } catch (reloadError) {
          reloadText = `\n⚠️ Registry reload failed: ${reloadError.message}`;
        }
        const backupText = extracted.backupRoot ? `\n🗂️ Backup: ${extracted.backupRoot}` : '';
        await sock.sendMessage(chatId, {
          text: `✅ *Bix ZIP extraction complete*\n\n📦 ${extracted.fileName}\n📁 Files: ${extracted.total}\n✍️ Written: ${extracted.written}\n♻️ Overwritten: ${extracted.overwritten}\n⏭️ Skipped: ${extracted.skipped}\n📂 Roots: ${extracted.roots.join(', ') || 'none'}${reloadText}${backupText}\n\nAny plugin2/Plugin2 root is normalized to *plugins2/*.`,
        }, { quoted: message });
        return true;
      }
    } catch (error) {
      await sock.sendMessage(chatId, { text: `❌ *Bix ZIP extraction failed*\n\n${error.message || error}` }, { quoted: message });
      return true;
    }
    return runBix({ sock, message, chatId, senderId, question: direct.question });
  }

  const reply = quotedBixQuestion(message);
  if (reply) return runBix({ sock, message, chatId, senderId, question: reply.text });

  return false;
}

module.exports = { handleDirectBix, runBix, parseBixTrigger, bodyText, rememberReply };
