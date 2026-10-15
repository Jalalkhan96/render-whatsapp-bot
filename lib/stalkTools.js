const PLATFORMS = {
  instagram: ['Instagram', 'https://instagram.com/'],
  ig: ['Instagram', 'https://instagram.com/'],
  tiktok: ['TikTok', 'https://tiktok.com/@'],
  tt: ['TikTok', 'https://tiktok.com/@'],
  youtube: ['YouTube', 'https://youtube.com/@'],
  yt: ['YouTube', 'https://youtube.com/@'],
  x: ['X', 'https://x.com/'],
  twitter: ['X', 'https://x.com/'],
  github: ['GitHub', 'https://github.com/'],
  reddit: ['Reddit', 'https://reddit.com/u/'],
  twitch: ['Twitch', 'https://twitch.tv/'],
  telegram: ['Telegram', 'https://t.me/']
};

function username(value) {
  const clean = String(value || '').replace(/^@/, '').trim();
  return /^[a-zA-Z0-9._-]{2,50}$/.test(clean) ? clean : null;
}

function platform(value) {
  return PLATFORMS[String(value || '').toLowerCase()];
}

function profileUrl(platformName, handle) {
  const selected = platform(platformName);
  return selected ? selected[1] + encodeURIComponent(handle) : null;
}

module.exports = { PLATFORMS, username, platform, profileUrl };
