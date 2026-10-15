const axios = require('axios');
const dns = require('dns');
const { getChannelInfo } = require('../../lib/channelInfo');
const { funnyError } = require('../../lib/funny');

const FAKE_FORWARD = getChannelInfo();

module.exports = {
  command: 'ipinfo',
  aliases: ['iprecon', 'iptrace'],
  category: 'security',
  description: 'Full IP/domain recon (location, ISP, ASN, org)',
  usage: '.ipinfo <ip/domain>',

  async handler(sock, message, args, context = {}) {
    const chatId = context.chatId || message.key.remoteJid;
    const target = (args[0] || '').trim().toLowerCase();
    if (!target) {
      return await sock.sendMessage(chatId, {
        text: '⚡ Enter an IP or domain.\nExample: .ipinfo 8.8.8.8  /  .ipinfo google.com',
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }

    let ip = target;
    const isDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(target) && !/^\d+\.\d+\.\d+\.\d+$/.test(target);
    if (isDomain) {
      try {
        const addrs = await new Promise((resolve, reject) =>
          dns.resolve4(target, (err, a) => err ? reject(err) : resolve(a)));
        ip = addrs[0];
      } catch (e) {
        return await sock.sendMessage(chatId, {
          text: `❌ Domain "${target}" resolve nahi hua.`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
      }
    }

    try {
      const res = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,query,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting`, { timeout: 15000 });
      const d = res.data;
      if (d.status === 'fail') {
        return await sock.sendMessage(chatId, {
          text: `❌ Lookup failed: ${d.message}`,
          contextInfo: FAKE_FORWARD
        }, { quoted: message });
      }

      const flags = [];
      if (d.proxy) flags.push('🚩 PROXY/VPN detected');
      if (d.hosting) flags.push('☁️ HOSTING/DATACENTER');
      if (d.mobile) flags.push('📱 MOBILE network');
      if (d.reverse) flags.push(`🔁 PTR: ${d.reverse}`);

      let text =
        `╭───「 🛰️ *IP RECON* 」\n` +
        `│ Target: ${isDomain ? target : ip}\n` +
        `╰───────────────○\n\n` +
        `🌐 *IP:* \`${d.query}\`\n` +
        `📍 *Location:* ${d.city}, ${d.regionName}, ${d.country} ${d.countryCode}\n` +
        `📮 *Zip:* ${d.zip || 'N/A'}\n` +
        `📐 *Coordinates:* ${d.lat}, ${d.lon}\n` +
        `🕐 *Timezone:* ${d.timezone || 'N/A'}\n` +
        `📡 *ISP:* ${d.isp}\n` +
        `🏢 *Org:* ${d.org || 'N/A'}\n` +
        `🔢 *ASN:* ${d.as || 'N/A'}${d.asname ? ' (' + d.asname + ')' : ''}`;

      if (flags.length) text += '\n\n⚠️ ' + flags.join('\n⚠️ ');
      text += '\n\n💡 .whois <domain> — domain details';

      await sock.sendMessage(chatId, { text, contextInfo: FAKE_FORWARD }, { quoted: message });
    } catch (err) {
      console.error('[IPINFO] Error:', err.message);
      await sock.sendMessage(chatId, {
        text: funnyError(err),
        contextInfo: FAKE_FORWARD
      }, { quoted: message });
    }
  }
};