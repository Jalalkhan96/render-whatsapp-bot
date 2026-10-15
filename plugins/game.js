'use strict';

const fs = require('fs');
const path = require('path');
const nativeArcade = require('../plugins2/wa-tricks/wa-trick-games.cjs');

const MANIFEST_FILE = path.join(__dirname, '../plugin4/manifest.json');
let manifest = [];
try {
  const raw = fs.readFileSync(MANIFEST_FILE, 'utf8');
  manifest = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
} catch (error) {
  console.warn('[GAME] Could not load plugin4 manifest:', error.message);
}

function getJid(message, context) {
  return context?.chatId || message?.key?.remoteJid;
}

function getPrefix(context) {
  return context?.prefix || '-';
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveGame(input) {
  const q = normalize(input);
  if (!q) return null;
  return manifest.find((entry) => {
    const names = [entry.game, entry.command, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
      .map(normalize);
    return names.includes(q);
  }) || null;
}

function loadGame(entry) {
  if (!entry?.source) return null;
  const file = path.join(__dirname, '../plugin4', entry.source);
  if (!fs.existsSync(file)) return null;
  try {
    delete require.cache[require.resolve(file)];
    const plugin = require(file);
    return plugin && typeof plugin.handler === 'function' ? plugin : null;
  } catch (error) {
    console.error(`[GAME] Failed loading ${entry.source}:`, error.message);
    return null;
  }
}

function gameList(prefix) {
  const rows = manifest.map((entry) => {
    const cmd = entry.command || entry.game;
    const alias = Array.isArray(entry.aliases) && entry.aliases[0] ? ` (${prefix}${entry.aliases[0]})` : '';
    return `${String(entry.index).padStart(2, '0')}. ${prefix}${cmd}${alias} — ${entry.game || 'Game'}`;
  });

  const groups = [];
  for (let i = 0; i < rows.length; i += 17) {
    groups.push(rows.slice(i, i + 17).join('\n'));
  }

  return [
    `🎮 *GAME ARCADE*`,
    `\nPlay games using WhatsApp chat commands — no document/download is used by this command.`,
    `\n📌 *Quick start*`,
    `${prefix}game tictactoe start`,
    `${prefix}game rps rock`,
    `${prefix}game trivia start`,
    `${prefix}game math start`,
    '',
    ...groups.map((group, index) => `📃 *GAMES ${index + 1}/${groups.length}*\n${group}`),
    '',
    `Use ${prefix}game <game> <options> to start a game.`,
  ].join('\n');
}

async function send(sock, jid, message, text) {
  return sock.sendMessage(jid, { text }, { quoted: message });
}

module.exports = {
  command: 'game',
  aliases: [],
  category: 'games',
  description: 'Open the WhatsApp chat game arcade',
  usage: '-game [game] [options]',

  async handler(sock, message, args, context = {}) {
    const jid = getJid(message, context);
    if (!jid) throw new Error('Chat JID is missing.');

    const prefix = getPrefix(context);
    const input = normalize(args[0]);

    if (!input || ['menu', 'list', 'all'].includes(input)) {
      // The game menu is a native HTML WhatsApp message, never an image.
      return nativeArcade.sendArcadeMenu(sock, jid, message, 1, prefix);
    }

    const entry = resolveGame(input);
    if (!entry) {
      return send(sock, jid, message,
        `❌ Game *${args[0]}* was not found.\n\nUse *${prefix}game* to open the Game Arcade.`
      );
    }

    const plugin = loadGame(entry);
    if (!plugin) {
      return send(sock, jid, message,
        `❌ Game *${entry.game || entry.command}* is currently unavailable.`
      );
    }

    // Forward the same WhatsApp message/context to the real game plugin.
    // Nothing is downloaded or generated as a fake forwarded message here.
    return plugin.handler(sock, message, args.slice(1), context);
  },
};
