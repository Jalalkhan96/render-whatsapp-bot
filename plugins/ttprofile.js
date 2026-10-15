const { createCanvas, loadImage } = require('@napi-rs/canvas');

function valueOf(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return fallback;
}

function numberOf(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function booleanOf(obj, keys, fallback = false) {
  const value = valueOf(obj, keys, null);
  if (value === null) return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function formatNumber(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function clean(value) {
  return String(value || '').replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function fit(ctx, text, maxWidth) {
  let value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value.length > 2 && ctx.measureText(`${value.slice(0, -1)}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function roundedBox(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function getAvatar(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36' },
    });
    if (!response.ok) return null;
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

function stat(ctx, x, value, label) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px Sans';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(value, x, 510);
  ctx.font = '17px Sans';
  ctx.fillStyle = '#999999';
  ctx.fillText(label, x, 538);
}

async function renderProfile(profile) {
  const width = 1080;
  const height = 1120;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const username = clean(valueOf(profile, ['handle', 'username', 'uniqueId', 'unique_id'])).replace(/^@/, '');
  const nickname = clean(valueOf(profile, ['nickname', 'displayName', 'display_name'], username));
  const bio = clean(valueOf(profile, ['signature', 'bio']));
  const avatarUrl = valueOf(profile, ['avatarUrl', 'avatarLarger', 'avatarMedium', 'avatarThumb', 'avatar']);
  const followers = numberOf(profile, ['followers', 'followerCount', 'follower_count']);
  const following = numberOf(profile, ['following', 'followingCount', 'following_count']);
  const likes = numberOf(profile, ['likes', 'likesCount', 'likeCount', 'heartCount', 'heart_count']);
  const videos = numberOf(profile, ['videosCount', 'videoCount', 'video_count']);
  const verified = booleanOf(profile, ['verified', 'isVerified', 'is_verified']);
  const privateAccount = booleanOf(profile, ['privateAccount', 'private_account']);

  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, width, height);
  const top = ctx.createLinearGradient(0, 0, 0, 360);
  top.addColorStop(0, '#151515');
  top.addColorStop(1, '#050505');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, 360);

  ctx.textAlign = 'left';
  ctx.font = 'bold 28px Sans';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('TikTok', 45, 58);
  ctx.textAlign = 'right';
  ctx.font = '18px Sans';
  ctx.fillStyle = '#777777';
  ctx.fillText('PROFILE', width - 45, 58);

  const avatar = await getAvatar(avatarUrl);
  const cx = width / 2;
  const cy = 185;
  const radius = 94;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = '#222222';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.textAlign = 'center';
    ctx.font = 'bold 65px Sans';
    ctx.fillStyle = '#777777';
    ctx.fillText(username.charAt(0).toUpperCase() || '?', cx, cy + 22);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.strokeStyle = '#303030';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = 'bold 32px Sans';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fit(ctx, nickname || username, 600), cx, 330);
  ctx.font = '20px Sans';
  ctx.fillStyle = '#999999';
  const usernameText = `@${username || 'unknown'}`;
  ctx.fillText(usernameText, cx, 365);

  if (verified) {
    const usernameWidth = ctx.measureText(usernameText).width;
    const bx = cx + usernameWidth / 2 + 17;
    ctx.beginPath();
    ctx.arc(bx, 358, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#20d5ec';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px Sans';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('✓', bx, 363);
  }

  stat(ctx, 290, formatNumber(following), 'Following');
  stat(ctx, 540, formatNumber(followers), 'Followers');
  stat(ctx, 790, formatNumber(likes), 'Likes');

  roundedBox(ctx, 205, 570, 320, 62, 10);
  ctx.fillStyle = '#ff0050';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 21px Sans';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Follow', 365, 601);

  roundedBox(ctx, 555, 570, 320, 62, 10);
  ctx.fillStyle = '#202020';
  ctx.fill();
  ctx.strokeStyle = '#3b3b3b';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Message', 715, 601);
  ctx.textBaseline = 'alphabetic';

  let y = 705;
  if (bio) {
    ctx.textAlign = 'center';
    ctx.font = '20px Sans';
    ctx.fillStyle = '#eeeeee';
    const lines = [];
    let line = '';
    for (const word of bio.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > 780) {
        if (line) lines.push(line);
        line = word;
      } else line = test;
      if (lines.length === 3) break;
    }
    if (line && lines.length < 3) lines.push(line);
    for (const item of lines) { ctx.fillText(item, cx, y); y += 30; }
  }

  y += 12;
  ctx.font = '17px Sans';
  ctx.fillStyle = privateAccount ? '#ff9f43' : '#777777';
  ctx.fillText(privateAccount ? 'Private account' : 'Public account', cx, y);

  y += 50;
  ctx.strokeStyle = '#242424';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(45, y);
  ctx.lineTo(width - 45, y);
  ctx.stroke();

  y += 62;
  ctx.font = 'bold 20px Sans';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Posts', 270, y);
  ctx.font = '20px Sans';
  ctx.fillStyle = '#777777';
  ctx.fillText('Reposts', 540, y);
  ctx.fillText('Liked', 810, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(170, y + 23, 200, 4);

  if (videos !== null) {
    y += 95;
    roundedBox(ctx, 45, y, width - 90, 100, 12);
    ctx.fillStyle = '#111111';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Sans';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${formatNumber(videos)} videos`, cx, y + 43);
    ctx.font = '16px Sans';
    ctx.fillStyle = '#777777';
    ctx.fillText('Public video count', cx, y + 70);
  }

  ctx.textAlign = 'center';
  ctx.font = '16px Sans';
  ctx.fillStyle = '#444444';
  ctx.fillText('ABIX-AE • TikTok Profile', cx, height - 32);
  return canvas.encode('png');
}

module.exports = {
  command: 'ttprofile',
  aliases: ['tiktokprofile'],
  category: 'social',
  description: 'Get a TikTok profile as an image',
  usage: '.ttprofile <username>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const input = (args || []).join(' ').trim();
    if (!input) {
      return sock.sendMessage(chatId, {
        text: '👤 *TIKTOK PROFILE*\n\nUsage:\n.ttprofile <username>\n\nExample:\n.ttprofile tiktok\n.ttprofile @tiktok',
      }, { quoted: message });
    }

    let username = input;
    const urlMatch = username.match(/tiktok\.com\/@([^/?#\s]+)/i);
    if (urlMatch) username = urlMatch[1];
    username = username.replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9._-]{2,64}$/.test(username)) {
      return sock.sendMessage(chatId, { text: '❌ Please provide a valid TikTok username.' }, { quoted: message });
    }

    const react = async emoji => {
      try { await sock.sendMessage(chatId, { react: { text: emoji, key: message.key } }); } catch {}
    };

    await react('👤');
    try {
      const { tiktokProfile } = require('../lib/social/socialHub');
      const result = await tiktokProfile(username, { maxItems: 1 });
      const profile = Array.isArray(result?.items) ? result.items[0] : result?.items?.[0] || result;
      if (!profile) {
        await react('❌');
        return sock.sendMessage(chatId, { text: `❌ *TIKTOK PROFILE*\n\nProfile not found or unavailable.\n\n@${username}` }, { quoted: message });
      }
      console.log('[ttprofile] PROFILE DATA:', JSON.stringify(profile, null, 2));
      const image = await renderProfile(profile);
      const actualUsername = clean(valueOf(profile, ['handle', 'username', 'uniqueId', 'unique_id'], username)).replace(/^@/, '');
      await sock.sendMessage(chatId, { image, caption: `👤 @${actualUsername}` }, { quoted: message });
      await react('✅');
    } catch (error) {
      console.error('[ttprofile]', error);
      await react('❌');
      await sock.sendMessage(chatId, { text: `❌ *TIKTOK PROFILE*\n\nUnable to fetch this profile right now.\n\n${error.message || 'Try again with a public TikTok username.'}` }, { quoted: message });
    }
  },
};
