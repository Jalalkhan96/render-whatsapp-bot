'use strict';

const fs = require('fs');
const path = require('path');
const { sendNativeHtmlGameWithFallback } = require('./richHtmlGame.cjs');

async function getPfpDataUri(sock, jid) {
  try {
    if (!jid || typeof sock?.profilePictureUrl !== 'function') return '';
    const url = await sock.profilePictureUrl(jid, 'image');
    if (!url || typeof fetch !== 'function') return '';
    const res = await fetch(url);
    if (!res.ok) return '';
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//i.test(contentType)) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 2 * 1024 * 1024) return '';
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

async function sendDedicatedHtmlGame(sock, message, game) {
  const jid = message?.key?.remoteJid;
  if (!jid) throw new Error('Chat JID is missing.');

  const allowed = new Set(['dino', 'flappy', 'snake']);
  if (!allowed.has(game)) throw new Error(`Unsupported HTML game: ${game}`);

  const file = path.join(__dirname, '..', 'plugins2', 'wa-tricks', 'games', `${game === 'dino' ? 'dino-runner' : game === 'flappy' ? 'flappy-bird' : 'snake'}.html`);
  if (!fs.existsSync(file)) throw new Error(`${game} HTML file not found: ${file}`);

  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('{{PFP}}')) {
    html = html.split('{{PFP}}').join(await getPfpDataUri(sock, jid));
  }

  const titles = { dino: 'Dino Runner', flappy: 'Flappy Bird', snake: 'Snake' };
  return sendNativeHtmlGameWithFallback(sock, jid, html, {
    title: titles[game],
    trustedSources: ['nixel.dev'],
    quoted: message,
    fallbackCaption: `🎮 ${titles[game]}`,
  });
}

module.exports = { sendDedicatedHtmlGame, getPfpDataUri };
