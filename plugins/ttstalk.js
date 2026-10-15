const axios = require('axios');
const cheerio = require('cheerio');
const { getChannelInfo } = require('../lib/channelInfo');
const { funnyError } = require('../lib/funny');

const FAKE_FORWARD = getChannelInfo();

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' };

async function viaDiscard(username) {
  const r = await axios.get('https://discardapi.dpdns.org/api/stalk/tiktok', {
    params: { apikey: 'guru', username }, timeout: 15000
  });
  const u = r.data?.result?.user;
  if (!u) throw new Error('not found');
  const s = r.data.result.statsV2 || r.data.result.stats || {};
  return {
    username: u.uniqueId, full: u.nickname, bio: u.signature,
    verified: !!u.verified, private: !!u.privateAccount,
    followers: s.followerCount, following: s.followingCount,
    likes: s.heartCount, videos: s.videoCount,
    image: u.avatarLarger || u.avatarMedium || u.avatarThumb
  };
}

async function viaScrape(username) {
  const r = await axios.get(`https://www.tiktok.com/@${username}`, { timeout: 20000, headers: UA });
  const $ = cheerio.load(r.data);
  let json = null;
  $('script').each((i, el) => {
    const id = $(el).attr('id');
    const type = $(el).attr('type');
    if (id === '__UNIVERSAL_DATA_FOR_REHYDRATION__' && type === 'application/json') {
      try { json = JSON.parse($(el).html()); } catch (e) {}
    }
  });
  const u = json?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
  const s = json?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.stats;
  if (!u) throw new Error('not found');
  return {
    username: u.uniqueId, full: u.nickname, bio: u.signature,
    verified: !!u.verified, private: !!u.privateAccount,
    followers: s?.followerCount, following: s?.followingCount,
    likes: s?.heartCount, videos: s?.videoCount,
    image: u.avatarLarger || u.avatarMedium || u.avatarThumb
  };
}

async function fetchUser(username) {
  const lastErr = [];
  for (const fn of [viaDiscard, viaScrape]) {
    try { return await fn(username); } catch (e) { lastErr.push(e.message); }
  }
  throw new Error(lastErr.join(' | '));
}

module.exports = {
  command: 'ttstalk',
  aliases: ['tikstalk'],
  category: 'stalk',
  description: 'Stalk up to 10 TikTok users (followers, likes, bio)',
  usage: '.ttstalk <user1> [user2] ... [user10]',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const users = args.map(a => a.replace(/^@/, '').trim()).filter(Boolean).slice(0, 10);
    if (!users.length) {
      return await sock.sendMessage(chatId, {
        text: '⚡ TikTok usernames do.\nExample: .ttstalk theonionknight ll_coco\n_Max 10 users._',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '🎵', key: message.key } });
    const results = [];
    for (const u of users) {
      try {
        results.push({ ok: true, ...(await fetchUser(u)) });
      } catch (e) {
        results.push({ ok: false, username: u, error: e.message });
      }
    }

    let text = `╭───「 🎵 *TIKTOK STALK* 」\n│ ${users.length} user(s)\n╰───────────────○\n\n`;
    for (const r of results) {
      if (!r.ok) {
        text += `❌ @${r.username} — not found/blocked\n\n`;
        continue;
      }
      text += `👤 *${r.full}* ${r.verified ? '✅' : ''}\n` +
        `🆔 @${r.username}${r.private ? ' 🔒 Private' : ''}\n` +
        `📝 ${r.bio || 'No bio'}\n` +
        `👥 ${r.followers || 0}  •  ➡️ ${r.following || 0}  •  ❤️ ${r.likes || 0}\n` +
        `🎥 ${r.videos || 0} videos\n` +
        `🔗 https://www.tiktok.com/@${r.username}\n\n`;
    }
    text += `💡 .tt <url> — TikTok video download`;

    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
    const okCount = results.filter(r => r.ok).length;
    await sock.sendMessage(chatId, { react: { text: okCount ? '✅' : '❌', key: message.key } });
  }
};