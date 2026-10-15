const axios = require('axios');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

const UA = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  'x-ig-app-id': '936619743392459'
};

async function fetchUser(username) {
  try {
    const r = await axios.get('https://i.instagram.com/api/v1/users/web_profile_info/', {
      params: { username }, timeout: 18000, headers: UA
    });
    const u = r.data?.data?.user;
    if (!u) throw new Error('empty');
    return {
      username: u.username, full: u.full_name, bio: u.biography,
      private: !!u.is_private, verified: !!u.is_verified,
      posts: u.edge_owner_to_timeline_media?.count ?? u.media_count,
      followers: u.edge_followed_by?.count ?? u.follower_count,
      following: u.edge_follow?.count ?? u.following_count,
      image: u.profile_pic_url_hd || u.profile_pic_url
    };
  } catch (e) {
    throw new Error(e.response?.status === 429 ? 'rate-limited (429)' : 'blocked/not-found');
  }
}

module.exports = {
  command: 'instalk',
  aliases: ['igstalk', 'igprofile', 'instaprofile'],
  category: 'stalk',
  description: 'Stalk up to 10 Instagram users (followers, posts, bio)',
  usage: '.instalk <user1> [user2] ... [user10]',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const users = args.map(a => a.replace(/^@/, '').replace(/\/$/, '').trim()).filter(Boolean).slice(0, 10);
    if (!users.length) {
      return await sock.sendMessage(chatId, {
        text: '⚡ Instagram usernames do.\nExample: .instalk cristiano messi neymarjr\n_Max 10 users._',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    await sock.sendMessage(chatId, { react: { text: '📸', key: message.key } });
    const results = [];
    for (const u of users) {
      try { results.push({ ok: true, ...(await fetchUser(u)) }); }
      catch (e) { results.push({ ok: false, username: u, error: e.message }); }
    }

    let text = `╭───「 📸 *INSTAGRAM STALK* 」\n│ ${users.length} user(s)\n╰───────────────○\n\n`;
    for (const r of results) {
      if (!r.ok) {
        text += `❌ @${r.username} — ${r.error || 'not found'}\n\n`;
        continue;
      }
      text += `👤 *${r.full || r.username}* ${r.verified ? '✅' : ''}\n` +
        `🆔 @${r.username}${r.private ? ' 🔒 Private' : ''}\n` +
        `📝 ${r.bio || 'No bio'}\n` +
        `📷 ${r.posts || 0}  •  👥 ${r.followers || 0}  •  ➡️ ${r.following || 0}\n` +
        `🔗 https://www.instagram.com/${r.username}\n\n`;
    }
    text += `💡 .ig <url> — Instagram post/video download`;

    await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
    const okCount = results.filter(r => r.ok).length;
    await sock.sendMessage(chatId, { react: { text: okCount ? '✅' : '❌', key: message.key } });
  }
};