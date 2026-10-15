'use strict';

const {
  fetchTikTokProfile,
  buildTikTokProfileCaption,
  fetchAvatarBuffer,
} = require('../lib/tiktok-profile-api.js');

async function react(sock, message, emoji) {
  try {
    await sock.sendMessage(message.key.remoteJid, {
      react: { text: emoji, key: message.key },
    });
  } catch {}
}

function parseArgs(args) {
  if (Array.isArray(args)) return args.join(' ').trim();
  return String(args ?? '').trim();
}

module.exports = {
  command: 'tiktokprofile',
  aliases: ['ttprofile', 'ttuser', 'tiktokuser', 'ttinfo', 'tiktokinfo'],
  description: 'Fetch public TikTok profile details using Apify',
  category: 'social',

  async handler(sock, message, args = []) {
    const chat = message?.key?.remoteJid;
    if (!chat || !message?.key) return;

    const input = parseArgs(args);
    if (!input) {
      await sock.sendMessage(chat, {
        text: [
          '╭━━━〔 🎵 TIKTOK PROFILE 〕━━━╮',
          '┃ Public account details + profile photo',
          '┣━━━━━━━━━━━━━━━━━━━━━━━━━━',
          '┃ -tiktokprofile username',
          '┃ -ttprofile @username',
          '┃ -tiktokinfo https://www.tiktok.com/@username',
          '╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
          'Configure APIFY_API_TOKEN in Render Environment to use this command.',
        ].join('\n'),
      }, { quoted: message });
      return;
    }

    await react(sock, message, '⏳');
    try {
      const profile = await fetchTikTokProfile(input);
      const caption = buildTikTokProfileCaption(profile);
      const avatar = await fetchAvatarBuffer(profile.avatarUrl);
      if (avatar) {
        await sock.sendMessage(chat, { image: avatar, caption }, { quoted: message });
      } else {
        await sock.sendMessage(chat, { text: caption }, { quoted: message });
      }
      await react(sock, message, '✅');
    } catch (error) {
      console.error('[TIKTOK PROFILE] Lookup failed:', error?.stack || error);
      await react(sock, message, '❌');
      await sock.sendMessage(chat, {
        text: `❌ TikTok profile lookup failed: ${String(error?.message || 'Unknown error').slice(0, 220)}`,
      }, { quoted: message }).catch(() => {});
    }
  },
};
