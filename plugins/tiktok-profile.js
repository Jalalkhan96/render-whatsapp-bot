import {
  fetchTikTokProfile,
  buildTikTokProfileCaption,
  fetchAvatarBuffer,
} from '../lib/tiktok-profile-api.js';

async function react(sock, msg, emoji) {
  try { await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }); } catch {}
}

function parseArgs(args) {
  if (Array.isArray(args)) return args.join(' ').trim();
  return String(args ?? '').trim();
}

export default {
  name: 'tiktokprofile',
  aliases: ['ttprofile', 'ttuser', 'tiktokuser', 'ttinfo', 'tiktokinfo'],
  description: 'Apify se public TikTok profile details fetch karein',
  category: 'social',

  async execute({ sock, msg, from, args }) {
    const chat = from || msg?.key?.remoteJid;
    if (!chat || !msg?.key) return;
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
          'Apify token bot ke .env mein APIFY_API_TOKEN ke naam se set karein.',
        ].join('\n'),
      }, { quoted: msg });
      return;
    }

    await react(sock, msg, '⏳');
    try {
      const profile = await fetchTikTokProfile(input);
      const caption = buildTikTokProfileCaption(profile);
      const avatar = await fetchAvatarBuffer(profile.avatarUrl);
      if (avatar) {
        await sock.sendMessage(chat, { image: avatar, caption }, { quoted: msg });
      } else {
        await sock.sendMessage(chat, { text: caption }, { quoted: msg });
      }
      await react(sock, msg, '✅');
    } catch (error) {
      console.error('[TIKTOK PROFILE] Lookup failed:', error?.stack || error);
      await react(sock, msg, '❌');
      await sock.sendMessage(chat, {
        text: `❌ TikTok profile lookup failed: ${String(error?.message || 'Unknown error').slice(0, 220)}`,
      }, { quoted: msg }).catch(() => {});
    }
  },
};
