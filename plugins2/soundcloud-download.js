'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sc = require('../soundcloud.cjs');

const TMP_ROOT = path.join(os.tmpdir(), 'abix-soundcloud');
const MAX_ITEMS = 5;

function usage(prefix = '-') {
  return [
    '🎧 *SOUNDCLOUD TOOLS*', '',
    `${prefix}scsearch <song or artist>`,
    `${prefix}scdownload <track, playlist, or user URL>`,
    `${prefix}scplaylist <playlist URL> [limit]`,
    `${prefix}scuser <profile URL> [limit]`,
    `${prefix}sclikes <profile URL> [limit]`, '',
    `At most ${MAX_ITEMS} tracks per request. Only unauthenticated official creator-enabled downloads are sent; no .env or API credentials are needed.`,
  ].join('\n');
}

function splitLimit(args, defaultLimit = MAX_ITEMS, parseLimit = true) {
  const copy = args.slice();
  let limit = defaultLimit;
  if (parseLimit && copy.length && /^\d+$/.test(String(copy[copy.length - 1]))) {
    limit = Number.parseInt(copy.pop(), 10);
  }
  limit = Math.max(1, Math.min(MAX_ITEMS, limit || defaultLimit));
  return { input: copy.join(' ').trim(), limit };
}

function resultLines(items) {
  return items.map((track, index) => {
    const downloadable = track.downloadable ? '✅ official download enabled' : '🔒 no official download';
    return `${index + 1}. *${String(track.title || 'Untitled').slice(0, 90)}*\n   ${String(track.artist || 'Unknown artist').slice(0, 50)} • ${track.duration || '?'}\n   ${downloadable}\n   ${track.url}`;
  }).join('\n\n');
}

async function send(sock, chatId, text, message) {
  return sock.sendMessage(chatId, { text }, message ? { quoted: message } : {});
}

async function sendAudio(sock, chatId, item, message) {
  const track = item.track || {};
  const filename = path.basename(item.path);
  await sock.sendMessage(chatId, {
    audio: { url: item.path },
    mimetype: item.contentType || 'audio/mpeg',
    fileName: filename,
    ptt: false,
  }, { quoted: message });
}

async function runSoundCloud(sock, message, args = [], context = {}, mode = 'help') {
  const chatId = context.chatId || message.key.remoteJid;
  const prefix = context.prefix || '-';
  const { input, limit } = splitLimit(args, MAX_ITEMS, mode !== 'search');
  if (mode === 'help' || !input) {
    if (mode === 'search' || mode === 'download' || mode === 'playlist' || mode === 'user' || mode === 'likes') {
      return send(sock, chatId, usage(prefix), message);
    }
    return send(sock, chatId, usage(prefix), message);
  }

  if (mode === 'search' && /^https?:\/\//i.test(input)) {
    return send(sock, chatId, `Use ${prefix}scdownload <SoundCloud URL> to process a track, playlist, or profile.`, message);
  }
  if (mode !== 'search' && !/^https?:\/\//i.test(input)) {
    return send(sock, chatId, `Provide a valid SoundCloud URL.\nExample: ${prefix}${mode === 'playlist' ? 'scplaylist' : mode === 'user' ? 'scuser' : mode === 'likes' ? 'sclikes' : 'scdownload'} https://soundcloud.com/...`, message);
  }

  let directory = null;
  try {
    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } }).catch(() => {});
    await send(sock, chatId, mode === 'search' ? '🔎 Searching SoundCloud...' : '🎧 Reading SoundCloud metadata and checking official download availability...', message);

    const auth = await sc.getAuth();
    const collected = await sc.collectTracks(auth, {
      mode,
      input,
      query: input,
      limit,
    });
    const tracks = (collected.tracks || []).slice(0, limit);

    if (!tracks.length) {
      await send(sock, chatId, 'No matching tracks were returned. Try a different public URL or search term.', message);
      return;
    }

    if (mode === 'search') {
      const text = `🎧 *SOUNDCLOUD SEARCH*\nQuery: ${input}\nResults: ${tracks.length}\n\n${resultLines(tracks)}\n\nUse ${prefix}scdownload <track URL> for an official creator-enabled download.`;
      await send(sock, chatId, text.slice(0, 3900), message);
      return;
    }

    directory = path.join(TMP_ROOT, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`);
    await fs.promises.mkdir(directory, { recursive: true });
    const result = await sc.downloadTracks(auth, tracks, directory);

    if (!result.files.length) {
      const hasEligible = tracks.some(track => track.downloadable);
      const explanation = hasEligible
        ? 'SoundCloud did not provide a public unauthenticated official download for these tracks. No login or stream-ripping fallback is used.'
        : 'These tracks do not have the creator-enabled download option. The bot will not extract playback streams.';
      await send(sock, chatId, `⚠️ No files downloaded.\n\n${explanation}\n\nTracks checked: ${tracks.length}\nSkipped: ${result.skipped}`, message);
      return;
    }

    await send(sock, chatId, `✅ Found ${result.files.length} downloadable file(s) from ${collected.label || collected.kind}. Sending now...`, message);
    for (const item of result.files) {
      await sendAudio(sock, chatId, item, message);
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    if (result.skipped) await send(sock, chatId, `ℹ️ Sent ${result.ok} file(s). Skipped ${result.skipped} track(s) because a creator-enabled public download was unavailable or the track was not downloadable.`, message);
    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }).catch(() => {});
  } catch (error) {
    console.error(`[SOUNDCLOUD-${mode.toUpperCase()}]`, error?.message || error);
    await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }).catch(() => {});
    await send(sock, chatId, `❌ SoundCloud failed.\n\n${String(error?.message || error).slice(0, 800)}`, message);
  } finally {
    if (directory) await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = [
  { command: 'scmusic', aliases: ['schelp'], category: 'download', description: 'Show SoundCloud search/download commands', usage: '-scmusic', handler: (sock, msg, args, ctx) => runSoundCloud(sock, msg, args, ctx, 'help') },
  { command: 'scsearch', aliases: [], category: 'download', description: 'Search SoundCloud tracks and show official-download availability', usage: '-scsearch <query>', handler: (sock, msg, args, ctx) => runSoundCloud(sock, msg, args, ctx, 'search') },
  { command: 'scdownload', aliases: [], category: 'download', description: 'Download official creator-enabled SoundCloud track/playlist/profile items', usage: '-scdownload <SoundCloud URL> [limit]', handler: (sock, msg, args, ctx) => runSoundCloud(sock, msg, args, ctx, 'auto') },
  { command: 'scplaylist', aliases: [], category: 'download', description: 'Download creator-enabled tracks from a SoundCloud playlist', usage: '-scplaylist <playlist URL> [limit]', handler: (sock, msg, args, ctx) => runSoundCloud(sock, msg, args, ctx, 'playlist') },
  { command: 'scuser', aliases: [], category: 'download', description: 'Download creator-enabled tracks from a SoundCloud user profile', usage: '-scuser <profile URL> [limit]', handler: (sock, msg, args, ctx) => runSoundCloud(sock, msg, args, ctx, 'user') },
  { command: 'sclikes', aliases: [], category: 'download', description: 'Download creator-enabled tracks from a public SoundCloud likes URL', usage: '-sclikes <profile URL> [limit]', handler: (sock, msg, args, ctx) => runSoundCloud(sock, msg, args, ctx, 'likes') },
];
